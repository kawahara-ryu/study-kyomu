/**
 * ============================================================================
 * テスト前夜の虚無バイト（StudyKYOMU+） メインロジック (main.js)
 * - Vanilla JS / 外部フレームワーク不使用
 * - スマホ & Chromebook 両対応（スリープ耐性差分タイマー / 3秒マージ引き継ぎ）
 * - 改ざん検知チェックサム & 事前入力Googleフォーム連携（プランA）
 * - @media print による数十KB超軽量サーマルレシートPDF出力
 * - Web Audio API ゼロ通信・作業用環境音シンセ
 * ============================================================================
 */

const CFG = window.KYOMU_CONFIG;
const STORAGE_KEY = 'kyomu_study_state_v1';
const SCHOOL_CFG_STORAGE_KEY = 'kyomu_school_cfg_v1';
const FORM_ENTRY_KEYS = [
    'examName', 'date', 'className', 'nickname', 'totalMinutes',
    'effectivePoints', 'subjectBreakdown', 'dailyReports', 'streakDays', 'verifyCode'
];
const sound = new LegoSoundEngine();

function isSafeHttpsUrl(u, requiredPrefix = 'https://') {
    if (typeof u !== 'string') return false;
    const s = u.trim();
    return s.startsWith(requiredPrefix) && !/[\s"'<>]/.test(s);
}

function applySchoolConfigObj(rawObj, fromUrl = false) {
    if (!rawObj || typeof rawObj !== 'object') return false;
    let applied = false;

    if (typeof rawObj.sn === 'string' && rawObj.sn.trim()) {
        CFG.schoolName = rawObj.sn.trim().slice(0, 32);
        applied = true;
    }
    if (typeof rawObj.yr === 'string' && /^\d{4}$/.test(rawObj.yr.trim())) {
        CFG.schoolYear = rawObj.yr.trim();
        applied = true;
    } else if (typeof rawObj.yr === 'number' && rawObj.yr >= 2020 && rawObj.yr <= 2100) {
        CFG.schoolYear = String(Math.floor(rawObj.yr));
        applied = true;
    }
    if (typeof rawObj.ex === 'string' && rawObj.ex.trim()) {
        CFG.examName = rawObj.ex.trim().slice(0, 24);
        applied = true;
    }
    if (typeof rawObj.dt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawObj.dt.trim())) {
        CFG.examDate = rawObj.dt.trim();
        applied = true;
    } else if (fromUrl && rawObj.dt === '') {
        CFG.examDate = '';
    }
    if (typeof rawObj.sa === 'string' && rawObj.sa.trim()) {
        CFG.securitySalt = rawObj.sa.trim().slice(0, 40);
        applied = true;
    }
    if (rawObj.fn === 0 || rawObj.fn === false) {
        CFG.allowFreeNickname = false;
        applied = true;
    } else if (rawObj.fn === 1 || rawObj.fn === true) {
        CFG.allowFreeNickname = true;
        applied = true;
    }
    if (isSafeHttpsUrl(rawObj.fu, 'https://docs.google.com/forms/')) {
        CFG.googleForm.enabled = true;
        CFG.googleForm.prefillBaseUrl = rawObj.fu.trim();
        applied = true;
    }
    if (Array.isArray(rawObj.en) && rawObj.en.length >= 9) {
        // 10項目版（先頭examName）または旧9項目版を自動判別して格納
        const keys = rawObj.en.length >= 10 ? FORM_ENTRY_KEYS : FORM_ENTRY_KEYS.slice(1);
        const nextEntries = { ...(CFG.googleForm.entries || {}) };
        keys.forEach((k, idx) => {
            const val = String(rawObj.en[idx] || '').trim();
            if (!val) return;
            nextEntries[k] = val.startsWith('entry.') ? val : `entry.${val}`;
        });
        CFG.googleForm.entries = nextEntries;
        applied = true;
    } else if (rawObj.en && typeof rawObj.en === 'object') {
        CFG.googleForm.entries = { ...(CFG.googleForm.entries || {}), ...rawObj.en };
        applied = true;
    }
    if (isSafeHttpsUrl(rawObj.bu, 'https://')) {
        CFG.rankingBoard.publicBoardUrl = rawObj.bu.trim();
        applied = true;
    }
    if (isSafeHttpsUrl(rawObj.cu, 'https://')) {
        CFG.rankingBoard.publicCsvUrl = rawObj.cu.trim();
        applied = true;
    }

    // 新しいテスト配布リンク(?cfg=...)を踏んだときは、前回の手動テスト設定も自動で最新テストへ同期！
    if (fromUrl && applied && typeof state === 'object' && state) {
        if (typeof rawObj.ex === 'string' && rawObj.ex.trim()) {
            state.examSetting = {
                name: rawObj.ex.trim().slice(0, 24),
                date: (typeof rawObj.dt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawObj.dt.trim())) ? rawObj.dt.trim() : ''
            };
            saveState();
        }
    }
    return applied;
}

function initSchoolConfigLink() {
    // 1. 端末に記憶済みの学校連携設定を復元
    try {
        const saved = localStorage.getItem(SCHOOL_CFG_STORAGE_KEY);
        if (saved) applySchoolConfigObj(JSON.parse(saved), false);
    } catch (e) {}

    // 2. Classroom配布URLの ?cfg=... を検出したら検証して自動保存＆適用（GitHub編集ゼロ運用！）
    let linkedFromUrl = false;
    try {
        const sp = new URLSearchParams(window.location.search);
        const cfgCode = (sp.get('cfg') || '').trim();
        if (cfgCode) {
            const parsed = JSON.parse(decodeUrlSafeBase64(cfgCode));
            if (applySchoolConfigObj(parsed, true)) {
                try { localStorage.setItem(SCHOOL_CFG_STORAGE_KEY, JSON.stringify(parsed)); } catch (e) {}
                linkedFromUrl = true;
            }
            sp.delete('cfg');
            const cleanUrl = location.pathname + (sp.toString() ? '?' + sp.toString() : '');
            if (history.replaceState) history.replaceState(null, '', cleanUrl);
        }
    } catch (e) {}

    return linkedFromUrl;
}

/* ============================================================================
   1. 脱力虚無キャラ 超軽量ベクターSVGアバター（画面＆PDFレシート共用）
   ============================================================================ */
const CHAR_SVGS = {
    penguin: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="14" fill="#1E1B3A"/>
        <ellipse cx="40" cy="48" rx="25" ry="27" fill="#334155" stroke="#000" stroke-width="3"/>
        <ellipse cx="40" cy="52" rx="17" ry="21" fill="#F8FAFC"/>
        <circle cx="31" cy="39" r="9" fill="#FFF" stroke="#000" stroke-width="2.5"/>
        <circle cx="49" cy="37" r="9" fill="#FFF" stroke="#000" stroke-width="2.5"/>
        <line x1="20" y1="36" x2="23" y2="38" stroke="#000" stroke-width="2.5"/>
        <line x1="57" y1="35" x2="62" y2="33" stroke="#000" stroke-width="2.5"/>
        <circle cx="30" cy="39" r="2.2" fill="#000"/>
        <circle cx="50" cy="37" r="2.2" fill="#000"/>
        <ellipse cx="40" cy="47" rx="6" ry="3.5" fill="#FACC15" stroke="#000" stroke-width="2.2"/>
        <path d="M58 22 C62 28 62 32 58 32 C54 32 54 28 58 22 Z" fill="#38BDF8" stroke="#000" stroke-width="1.8"/>
    </svg>`,
    banana: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="14" fill="#2A1836"/>
        <path d="M27 68 L28 24 C28 14 52 14 52 24 L53 68 Z" fill="#FACC15" stroke="#000" stroke-width="3"/>
        <path d="M27 45 C14 48 12 60 22 65 L28 56 Z" fill="#FDE047" stroke="#000" stroke-width="2.5"/>
        <path d="M53 45 C66 48 68 60 58 65 L52 56 Z" fill="#FDE047" stroke="#000" stroke-width="2.5"/>
        <path d="M25 22 L56 17 L61 24 L27 28 Z" fill="#FF4DA6" stroke="#000" stroke-width="2.5"/>
        <circle cx="34" cy="37" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.3"/>
        <circle cx="47" cy="37" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.3"/>
        <circle cx="33" cy="37" r="2" fill="#000"/>
        <circle cx="48" cy="37" r="2" fill="#000"/>
        <line x1="36" y1="48" x2="45" y2="48" stroke="#000" stroke-width="2.6" stroke-linecap="round"/>
    </svg>`,
    shiba: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="14" fill="#2D1D16"/>
        <polygon points="18,32 24,14 34,26" fill="#FB923C" stroke="#000" stroke-width="2.8"/>
        <polygon points="62,32 56,14 46,26" fill="#FB923C" stroke="#000" stroke-width="2.8"/>
        <ellipse cx="40" cy="46" rx="25" ry="22" fill="#FB923C" stroke="#000" stroke-width="3"/>
        <ellipse cx="40" cy="52" rx="18" ry="14" fill="#FEF3C7"/>
        <circle cx="30" cy="41" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="50" cy="41" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="29.5" cy="41" r="2" fill="#000"/>
        <circle cx="50.5" cy="41" r="2" fill="#000"/>
        <ellipse cx="40" cy="49" rx="4" ry="2.8" fill="#000"/>
        <path d="M35 55 Q40 53 45 55" fill="none" stroke="#000" stroke-width="2.2"/>
    </svg>`,
    hammy: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="14" fill="#132A24"/>
        <circle cx="22" cy="24" r="8" fill="#F59E0B" stroke="#000" stroke-width="2.6"/>
        <circle cx="58" cy="24" r="8" fill="#F59E0B" stroke="#000" stroke-width="2.6"/>
        <ellipse cx="40" cy="47" rx="28" ry="23" fill="#FCD34D" stroke="#000" stroke-width="3"/>
        <ellipse cx="22" cy="52" rx="9" ry="7" fill="#FDBA74" stroke="#000" stroke-width="2"/>
        <ellipse cx="58" cy="52" rx="9" ry="7" fill="#FDBA74" stroke="#000" stroke-width="2"/>
        <rect x="17" y="25" width="46" height="7" rx="3" fill="#FFFFFF" stroke="#000" stroke-width="2"/>
        <circle cx="40" cy="28.5" r="2.5" fill="#EF4444"/>
        <circle cx="31" cy="41" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="49" cy="41" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="31.5" cy="41" r="1.9" fill="#000"/>
        <circle cx="48.5" cy="41" r="1.9" fill="#000"/>
        <rect x="37.5" y="51" width="5" height="5" fill="#FFF" stroke="#000" stroke-width="1.8"/>
    </svg>`,
    takoyaki: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="14" fill="#2B1220"/>
        <line x1="56" y1="10" x2="46" y2="30" stroke="#FDE68A" stroke-width="4" stroke-linecap="round"/>
        <circle cx="40" cy="46" r="24" fill="#D97706" stroke="#000" stroke-width="3"/>
        <path d="M18 37 Q28 24 40 25 Q54 24 62 37 Q54 42 46 36 Q38 43 30 37 Q24 42 18 37 Z" fill="#451A03" stroke="#000" stroke-width="2"/>
        <circle cx="31" cy="48" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="49" cy="48" r="6.5" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="30" cy="48" r="2" fill="#000"/>
        <circle cx="50" cy="48" r="2" fill="#000"/>
        <line x1="36" y1="58" x2="44" y2="58" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`,
    cat: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="14" fill="#2A1228"/>
        <polygon points="18,34 22,16 35,28" fill="#FB923C" stroke="#000" stroke-width="2.8"/>
        <polygon points="62,34 58,16 45,28" fill="#FB923C" stroke="#000" stroke-width="2.8"/>
        <ellipse cx="40" cy="48" rx="25" ry="22" fill="#FB923C" stroke="#000" stroke-width="3"/>
        <rect x="27" y="13" width="26" height="12" rx="4" fill="#FFF" stroke="#000" stroke-width="2.4" transform="rotate(-7 40 19)"/>
        <circle cx="30" cy="43" r="7" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="50" cy="43" r="7" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="29" cy="43" r="2" fill="#000"/>
        <circle cx="51" cy="43" r="2" fill="#000"/>
        <polygon points="37,51 43,51 40,54" fill="#FF4DA6"/>
        <rect x="38" y="55" width="4.5" height="5" fill="#FFF" stroke="#000" stroke-width="1.8"/>
    </svg>`,
    chikuwa: `<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <rect width="80" height="80" rx="14" fill="#1F1534"/>
        <rect x="24" y="14" width="32" height="54" rx="12" fill="#FDE68A" stroke="#000" stroke-width="3"/>
        <rect x="24" y="25" width="32" height="32" fill="#B45309" opacity="0.65"/>
        <ellipse cx="40" cy="18" rx="11" ry="4.5" fill="#1F1534" stroke="#000" stroke-width="2"/>
        <circle cx="33" cy="40" r="6" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="47" cy="40" r="6" fill="#FFF" stroke="#000" stroke-width="2.2"/>
        <circle cx="32.5" cy="40" r="1.9" fill="#000"/>
        <circle cx="47.5" cy="40" r="1.9" fill="#000"/>
        <line x1="36" y1="51" x2="44" y2="51" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`
};

/* ============================================================================
   2. 虚無二つ名ガチャ（50形容詞 × 50名詞 ＝ 2,500通り）
   ============================================================================ */
const NICK_ADJ = [
    "爆睡の", "時給1100円の", "定時退社の", "こたつ在住の", "虚無顔の",
    "皮むけ", "朝勉の", "プリン待機の", "断固拒否する", "赤点回避の",
    "ちくわ推しの", "テスト前夜の", "労基署公認の", "無気力な", "2進数の",
    "丸メガネの", "氷山帰りの", "頬袋パンパンの", "布団と融合した", "たこ焼き愛好の",
    "深夜カフェの", "圧倒的省エネ", "おにぎり持参の", "ワーク周回の", "単位死守の",
    "居眠り寸前の", "蛍光ペン紛失の", "自習室常連の", "やる気行方不明の", "ギリギリ生還の",
    "15分だけ本気の", "糖分補給中の", "チャイム待機の", "三白眼の", "謎テンションの",
    "全科目制覇の", "カフェ店長の", "おでん好きの", "サウナ帰りの", "ノート紛失の",
    "暗記パン待ちの", "教科書枕の", "早寝ガチ勢の", "省エネ運転の", "猫背の",
    "のんびり屋な", "集中モードの", "伝説の", "ほのぼの", "ゆるふわ"
];

const NICK_NOUN = [
    "チルペンギン", "ボクバナナ", "拒否柴", "徹夜ハムスター", "ネコビッツ",
    "虚無たこ焼き", "屋上ちくわ", "塩おにぎり", "キャラメルプリン", "2進数バーガー",
    "ちくわパフェ", "皮むけパンケーキ", "ウインナー", "ブロッコリー", "焼きナス",
    "揚げパン", "コーヒーゼリー", "赤ペン職人", "消しカス", "定規マスター",
    "付箋の達人", "単語カード", "丸メガネ", "紙バイザー", "こたつミカン",
    "目覚まし時計", "タイマー職人", "電卓の民", "ポモドーロ", "バイトリーダー",
    "カフェ店員", "深夜の賢者", "早朝ランナー", "自習室の主", "ワーク狩人",
    "テスト戦士", "シバ犬", "ペンギン", "バナナ", "ハムスター",
    "三毛猫", "黒猫", "白猫", "タコ", "イクラ",
    "メロンパン", "タピオカ", "抹茶ラテ", "クリームソーダ", "おもち"
];

/* ============================================================================
   3. 退勤カプセル図鑑（全24種）
   ============================================================================ */
const GACHA_ITEMS = [
    { id: "g01", rarity: "N",   emoji: "🍮", name: "冷蔵庫のプリン",       note: "日報を書かないと食べられる運命。" },
    { id: "g02", rarity: "N",   emoji: "✏️", name: "芯が折れたシャーペン", note: "テスト5分前に限って詰まる。" },
    { id: "g03", rarity: "N",   emoji: "👓", name: "ズレた丸メガネ",       note: "チルペンギン愛用の度なしレンズ。" },
    { id: "g04", rarity: "N",   emoji: "🧢", name: "ピンク紙バイザー",     note: "ボクバナナのバイト正装。" },
    { id: "g05", rarity: "N",   emoji: "🍢", name: "屋上のちくわ",         note: "穴から明日のテスト範囲が見える。" },
    { id: "g06", rarity: "N",   emoji: "🍙", name: "早弁おにぎり",         note: "2限と3限の間に消える謎の物体。" },
    { id: "g07", rarity: "N",   emoji: "🖍️", name: "乾いた蛍光ペン",       note: "大事な行だけかすれて引けない。" },
    { id: "g08", rarity: "N",   emoji: "☕", name: "ぬるいアイスコーヒー", note: "氷が全部溶けた深夜22時の味。" },
    { id: "g09", rarity: "N",   emoji: "🗒️", name: "大量の付箋",           note: "貼っただけで覚えた気になれる。" },
    { id: "g10", rarity: "N",   emoji: "🧦", name: "片方だけの靴下",       note: "コタツの奥から発掘された。" },
    { id: "g11", rarity: "R",   emoji: "🍨", name: "ちくわパフェ",         note: "数学シフトの定番まかない。" },
    { id: "g12", rarity: "R",   emoji: "🥞", name: "皮むけパンケーキ",     note: "英単語10語分の甘さ。" },
    { id: "g13", rarity: "R",   emoji: "🍔", name: "2進数バーガー",        note: "1010円（10進数で10円）の激安。" },
    { id: "g14", rarity: "R",   emoji: "🐙", name: "歴史たこ焼き",         note: "アツアツのうちに年号を暗記。" },
    { id: "g15", rarity: "R",   emoji: "🐕", name: "断固拒否リード",       note: "散歩も赤点も全力で拒否する。" },
    { id: "g16", rarity: "R",   emoji: "🐹", name: "頬袋メモリー",         note: "化学式を32GBまで一時保存。" },
    { id: "g17", rarity: "R",   emoji: "⏰", name: "早朝1.2倍目覚まし",    note: "朝勉ボーナスを呼ぶ最強クロック。" },
    { id: "g18", rarity: "R",   emoji: "🛋️", name: "人をダメにする座布団", note: "退勤後だけ座ることが許される。" },
    { id: "g19", rarity: "SR",  emoji: "🎫", name: "伝説の定時タイムカード", note: "23時前に押すと労基署が拍手する。" },
    { id: "g20", rarity: "SR",  emoji: "🐧", name: "白衣のチルペンギン",   note: "「氷山帰りたいペン…」と呟く名医。" },
    { id: "g21", rarity: "SR",  emoji: "🍌", name: "時給1,100円バナナ",    note: "皮が完全にむけて悟りを開いた姿。" },
    { id: "g22", rarity: "SR",  emoji: "🐱", name: "無気力ネコビッツ店長", note: "死んだ目のまま全員を赤点から救う。" },
    { id: "g23", rarity: "SSR", emoji: "👑", name: "黄金の早寝プリン王",   note: "睡眠8時間と高得点を両立する神。" },
    { id: "g24", rarity: "SSR", emoji: "🌈", name: "五つ星・虚無ビストロ鍵", note: "全科目バランス達成者だけの秘宝！" }
];

/* ============================================================================
   4. ハイブリッド多チャンネル環境音ミキサー（実録MP3 10種 × 内蔵シンセ 1種）
      - 遅延ロード(preload="none")で初期表示0KB増＆省通信量
      - 複数トラック同時重ねがけ＋300msなめらかフェード＋一時停止ダッキング対応
   ============================================================================ */
const AMBIENT_TRACKS = [
    { id: 'rain_soft',     kind: 'mp3',   icon: '🌧️', name: 'しとしと雨',     tag: '万能集中',     src: './ambient/rain_soft.mp3',     defaultVol: 75 },
    { id: 'rain_summer',   kind: 'mp3',   icon: '☔',  name: '夏の雨音',       tag: '深い没頭',     src: './ambient/rain_summer.mp3',   defaultVol: 65 },
    { id: 'rain_gentle',   kind: 'mp3',   icon: '🛌', name: '深い雨（長尺）', tag: 'リラックス',   src: './ambient/rain_gentle.mp3',   defaultVol: 60 },
    { id: 'fire',          kind: 'mp3',   icon: '🔥', name: '焚き火パチパチ', tag: '実録・没頭',   src: './ambient/fire.mp3',          defaultVol: 70 },
    { id: 'river',         kind: 'mp3',   icon: '🌊', name: '川のせせらぎ',   tag: '暗記・1/f',    src: './ambient/river.mp3',         defaultVol: 70 },
    { id: 'midnight',      kind: 'mp3',   icon: '🌙', name: '深夜の虫の音',   tag: '夜カフェ感',   src: './ambient/midnight.mp3',      defaultVol: 50 },
    { id: 'forest_spring', kind: 'mp3',   icon: '🌲', name: '春の森',         tag: '自然空間',     src: './ambient/forest_spring.mp3', defaultVol: 65 },
    { id: 'birds_morning', kind: 'mp3',   icon: '🐦', name: '朝の小鳥',       tag: '朝勉ブースト', src: './ambient/birds_morning.mp3', defaultVol: 55 },
    { id: 'birds_forest',  kind: 'mp3',   icon: '🦜', name: '森の鳥たち',     tag: '気分転換',     src: './ambient/birds_forest.mp3',  defaultVol: 50 },
    { id: 'wind',          kind: 'mp3',   icon: '🍃', name: 'そよ風',         tag: '爽やか空間',   src: './ambient/wind.mp3',          defaultVol: 50 },
    { id: 'synth_cafe',    kind: 'synth', icon: '☕', name: '深夜カフェLo-Fi', tag: '内蔵シンセ',   defaultVol: 55 }
];

const AMBIENT_PRESETS = {
    night_rain_cafe: { label: '🌧️ 深夜の雨カフェ', mix: { rain_soft: 75, midnight: 45, synth_cafe: 55 } },
    river_focus:     { label: '🌊 せせらぎ集中',   mix: { river: 75, wind: 40 } },
    morning_forest:  { label: '🐦 朝勉の森',       mix: { forest_spring: 65, birds_morning: 55 } },
    rain_fire:       { label: '🔥 雨と焚き火',     mix: { rain_summer: 60, fire: 70 } }
};

class AmbientSoundEngine {
    constructor() {
        this.ctx = null;
        this.masterVol = 0.55;
        this.duckFactor = 1.0;
        this.activePreset = 'off';
        this.tracks = new Map();
        AMBIENT_TRACKS.forEach(meta => {
            this.tracks.set(meta.id, {
                meta,
                active: false,
                vol: meta.defaultVol / 100,
                audio: null,
                fadeTimer: null,
                synthGain: null,
                synthNodes: [],
                synthInterval: null
            });
        });
    }

    ensureCtx() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) this.ctx = new Ctx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }

    calcEffectiveVol(tr) {
        return Math.max(0, Math.min(1, this.masterVol * tr.vol * this.duckFactor));
    }

    fadeAudioEl(tr, targetVol, onDone) {
        if (!tr.audio) {
            if (onDone) onDone();
            return;
        }
        if (tr.fadeTimer) {
            clearInterval(tr.fadeTimer);
            tr.fadeTimer = null;
        }
        const startVol = tr.audio.volume;
        const steps = 10;
        let step = 0;
        tr.fadeTimer = setInterval(() => {
            step++;
            const ratio = step / steps;
            const next = startVol + (targetVol - startVol) * ratio;
            try { tr.audio.volume = Math.max(0, Math.min(1, next)); } catch (e) {}
            if (step >= steps) {
                clearInterval(tr.fadeTimer);
                tr.fadeTimer = null;
                if (onDone) onDone();
            }
        }, 30);
    }

    startSynthTrack(tr) {
        this.ensureCtx();
        if (!this.ctx) return;
        this.stopSynthTrack(tr, true);

        const gainNode = this.ctx.createGain();
        const now = this.ctx.currentTime;
        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(Math.max(0.001, this.calcEffectiveVol(tr)), now + 0.35);
        gainNode.connect(this.ctx.destination);
        tr.synthGain = gainNode;
        tr.synthNodes.push(gainNode);

        const sr = this.ctx.sampleRate;
        const len = sr * 2;
        const buffer = this.ctx.createBuffer(1, len, sr);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < len; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.997 * b0 + white * 0.029;
            b1 = 0.985 * b1 + white * 0.032;
            b2 = 0.950 * b2 + white * 0.048;
            data[i] = (b0 + b1 + b2 + white * 0.015) * 0.65;
        }

        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = tr.meta.id === 'synth_fire' ? 340 : 620;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.value = tr.meta.id === 'synth_fire' ? 0.55 : 0.22;
        src.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(gainNode);
        src.start();
        tr.synthNodes.push(src, filter, noiseGain);

        if (tr.meta.id === 'synth_fire') {
            tr.synthInterval = setInterval(() => {
                if (!this.ctx || !tr.active) return;
                if (Math.random() > 0.55) return;
                const t = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(1400 + Math.random() * 1800, t);
                g.gain.setValueAtTime(0.08 * Math.random(), t);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
                osc.connect(g);
                g.connect(gainNode);
                osc.start(t);
                osc.stop(t + 0.04);
            }, 260);
        } else if (tr.meta.id === 'synth_cafe') {
            const chords = [
                [174.61, 220.00, 261.63, 329.63],
                [164.81, 196.00, 246.94, 293.66],
                [146.83, 174.61, 220.00, 261.63],
                [130.81, 164.81, 196.00, 246.94]
            ];
            let step = 0;
            const playPad = () => {
                if (!this.ctx || !tr.active) return;
                const t = this.ctx.currentTime;
                const notes = chords[step % chords.length];
                step++;
                notes.forEach(freq => {
                    const osc = this.ctx.createOscillator();
                    const g = this.ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, t);
                    g.gain.setValueAtTime(0.001, t);
                    g.gain.linearRampToValueAtTime(0.04, t + 0.9);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 3.8);
                    osc.connect(g);
                    g.connect(gainNode);
                    osc.start(t);
                    osc.stop(t + 3.9);
                });
            };
            playPad();
            tr.synthInterval = setInterval(playPad, 4000);
        }
    }

    stopSynthTrack(tr, immediate = false) {
        if (tr.synthInterval) {
            clearInterval(tr.synthInterval);
            tr.synthInterval = null;
        }
        const nodesToClean = tr.synthNodes.slice();
        const gNode = tr.synthGain;
        tr.synthNodes = [];
        tr.synthGain = null;
        if (!nodesToClean.length) return;

        const dispose = () => {
            nodesToClean.forEach(n => {
                try { if (n.stop) n.stop(); } catch (e) {}
                try { if (n.disconnect) n.disconnect(); } catch (e) {}
            });
        };
        if (immediate || !this.ctx || !gNode) {
            dispose();
        } else {
            try {
                gNode.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
            } catch (e) {}
            setTimeout(dispose, 280);
        }
    }

    enableTrack(trackId, volPct = null) {
        const tr = this.tracks.get(trackId);
        if (!tr) return;
        if (volPct !== null && Number.isFinite(volPct)) {
            tr.vol = Math.max(0.05, Math.min(1, volPct / 100));
        }
        tr.active = true;
        if (tr.meta.kind === 'mp3') {
            if (!tr.audio) {
                const aud = new Audio(tr.meta.src);
                aud.loop = true;
                aud.preload = 'none';
                aud.volume = 0;
                tr.audio = aud;
            }
            const p = tr.audio.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
            this.fadeAudioEl(tr, this.calcEffectiveVol(tr));
        } else {
            this.startSynthTrack(tr);
        }
    }

    disableTrack(trackId) {
        const tr = this.tracks.get(trackId);
        if (!tr || !tr.active) return;
        tr.active = false;
        if (tr.meta.kind === 'mp3') {
            this.fadeAudioEl(tr, 0, () => {
                if (!tr.active && tr.audio) {
                    try { tr.audio.pause(); } catch (e) {}
                }
            });
        } else {
            this.stopSynthTrack(tr, false);
        }
    }

    toggleTrack(trackId) {
        const tr = this.tracks.get(trackId);
        if (!tr) return false;
        if (tr.active) {
            this.disableTrack(trackId);
        } else {
            this.enableTrack(trackId);
        }
        this.activePreset = this.detectPresetId();
        return tr.active;
    }

    applyMix(mixObj, presetId = 'custom') {
        // 旧保存データ(synth_fire)を実録MP3焚き火(fire)へ自動マイグレーション
        const normalized = {};
        Object.entries(mixObj || {}).forEach(([k, v]) => {
            normalized[k === 'synth_fire' ? 'fire' : k] = v;
        });
        const targetIds = new Set(Object.keys(normalized));
        this.tracks.forEach((tr, id) => {
            if (targetIds.has(id)) {
                this.enableTrack(id, Number(normalized[id]));
            } else {
                this.disableTrack(id);
            }
        });
        this.activePreset = targetIds.size ? presetId : 'off';
    }

    applyPreset(presetId) {
        if (presetId === 'off' || !AMBIENT_PRESETS[presetId]) {
            this.stopAll();
            return;
        }
        this.applyMix(AMBIENT_PRESETS[presetId].mix, presetId);
    }

    stopAll() {
        this.tracks.forEach((tr, id) => {
            if (tr.active) this.disableTrack(id);
        });
        this.activePreset = 'off';
    }

    setMasterVolume(vol0to1) {
        this.masterVol = Math.max(0, Math.min(1, vol0to1));
        this.syncVolumes();
    }

    setTrackVolume(trackId, vol0to1) {
        const tr = this.tracks.get(trackId);
        if (!tr) return;
        tr.vol = Math.max(0.05, Math.min(1, vol0to1));
        if (tr.active) {
            const eff = this.calcEffectiveVol(tr);
            if (tr.meta.kind === 'mp3' && tr.audio) {
                try { tr.audio.volume = eff; } catch (e) {}
            } else if (tr.synthGain && this.ctx) {
                tr.synthGain.gain.setTargetAtTime(Math.max(0.0001, eff), this.ctx.currentTime, 0.06);
            }
        }
    }

    setDucking(isDucked) {
        this.duckFactor = isDucked ? 0.25 : 1.0;
        this.syncVolumes();
    }

    syncVolumes() {
        this.tracks.forEach(tr => {
            if (!tr.active) return;
            const eff = this.calcEffectiveVol(tr);
            if (tr.meta.kind === 'mp3' && tr.audio) {
                this.fadeAudioEl(tr, eff);
            } else if (tr.synthGain && this.ctx) {
                tr.synthGain.gain.setTargetAtTime(Math.max(0.0001, eff), this.ctx.currentTime, 0.08);
            }
        });
    }

    getActiveTracks() {
        const list = [];
        this.tracks.forEach(tr => { if (tr.active) list.push(tr); });
        return list;
    }

    getCurrentMixObject() {
        const mix = {};
        this.tracks.forEach((tr, id) => {
            if (tr.active) mix[id] = Math.round(tr.vol * 100);
        });
        return mix;
    }

    detectPresetId() {
        const activeIds = this.getActiveTracks().map(t => t.meta.id).sort().join(',');
        if (!activeIds) return 'off';
        for (const [pid, p] of Object.entries(AMBIENT_PRESETS)) {
            const pIds = Object.keys(p.mix).sort().join(',');
            if (pIds === activeIds) return pid;
        }
        return 'custom';
    }
}

const ambient = new AmbientSoundEngine();

/* ============================================================================
   5. アプリ状態管理 & ユーティリティ
   ============================================================================ */
const PLAN_DAYS = [
    { key: 'mon', label: '月', full: '月曜日', jsDay: 1 },
    { key: 'tue', label: '火', full: '火曜日', jsDay: 2 },
    { key: 'wed', label: '水', full: '水曜日', jsDay: 3 },
    { key: 'thu', label: '木', full: '木曜日', jsDay: 4 },
    { key: 'fri', label: '金', full: '金曜日', jsDay: 5 },
    { key: 'sat', label: '土', full: '土曜日', jsDay: 6 },
    { key: 'sun', label: '日', full: '日曜日', jsDay: 0 }
];
const PLAN_MIN = 300;   // 05:00
const PLAN_MAX = 1440;  // 24:00

const LIFE_ACTIVITIES = [
    { id: 'school', name: '学校・部活', icon: '🏫', color: '#94A3B8' },
    { id: 'bath',   name: 'お風呂',     icon: '🛁', color: '#38BDF8' },
    { id: 'meal',   name: 'ごはん',     icon: '🍽️', color: '#FB923C' },
    { id: 'break',  name: '休憩・スマホ', icon: '☕', color: '#A3E635' },
    { id: 'sleep',  name: '睡眠・就寝', icon: '🛌', color: '#818CF8' }
];

function getTodayDayKey() {
    const d = new Date().getDay();
    const found = PLAN_DAYS.find(x => x.jsDay === d);
    return found ? found.key : 'mon';
}

function createInitialWeeklyPlan() {
    const empty = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    const tk = getTodayDayKey();
    empty[tk] = [
        { id: 'p_init_1', startMin: 1140, endMin: 1185, kind: 'study', itemId: 'english' }, // 19:00-19:45 英語
        { id: 'p_init_2', startMin: 1185, endMin: 1215, kind: 'life',  itemId: 'bath' },    // 19:45-20:15 お風呂
        { id: 'p_init_3', startMin: 1215, endMin: 1260, kind: 'study', itemId: 'math' },    // 20:15-21:00 数学
        { id: 'p_init_4', startMin: 1380, endMin: 1440, kind: 'life',  itemId: 'sleep' }    // 23:00-24:00 睡眠
    ];
    return empty;
}

function formatPlanTime(minVal) {
    const h = Math.floor(minVal / 60);
    const m = minVal % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getTodayStr(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getUrlExamParams() {
    try {
        const sp = new URLSearchParams(window.location.search);
        const exam = (sp.get('exam') || '').trim();
        const date = (sp.get('date') || '').trim();
        return {
            name: exam.slice(0, 20),
            date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ''
        };
    } catch (e) {
        return { name: '', date: '' };
    }
}

function getActiveExamInfo() {
    const urlP = getUrlExamParams();
    const userSet = (state && state.examSetting) ? state.examSetting : { name: '', date: '' };
    const name = urlP.name || userSet.name || CFG.examName || '定期考査';
    const dateStr = urlP.date || userSet.date || (/^\d{4}-\d{2}-\d{2}$/.test(CFG.examDate || '') ? CFG.examDate : '');

    let daysLeft = null;
    if (dateStr) {
        const now = new Date();
        const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(dateStr + 'T09:00:00');
        const target0 = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        daysLeft = Math.max(0, Math.round((target0 - today0) / 86400000));
    }
    return { name, dateStr, daysLeft };
}

function getTimeZoneBonus(dateObj = new Date()) {
    const h = dateObj.getHours();
    const m = dateObj.getMinutes();
    const r = CFG.rules;
    if (h >= r.morningBonusStartHour && h < r.morningBonusEndHour) {
        return { kind: 'morning', mult: r.morningMultiplier, label: `🌅 朝勉手当 ${r.morningMultiplier}倍中!` };
    }
    if ((h > r.lateNightStartHour || (h === r.lateNightStartHour && m >= r.lateNightStartMin)) || h < r.lateNightEndHour) {
        return { kind: 'latenight', mult: r.lateNightMultiplier, label: `🌙 深夜労基ブレーキ ${r.lateNightMultiplier}倍` };
    }
    return { kind: 'normal', mult: 1.0, label: '⏰ 通常シフト (1.0倍)' };
}

/**
 * 改ざん検知チェックサム（main.js / teacher_dashboard.html / GAS で完全同一ロジック）
 * 生徒が提出コードやフォームの数字だけ手書き改変すると即座に不一致となる。
 */
function computeVerifyChecksum(dateStr, className, nickname, totalMin, effectivePt, salt) {
    const raw = `${dateStr}|${className}|${nickname}|${totalMin}|${effectivePt}|${salt || CFG.securitySalt}`;
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) {
        hash ^= raw.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function rollRandomNickname() {
    const adj = NICK_ADJ[Math.floor(Math.random() * NICK_ADJ.length)];
    const noun = NICK_NOUN[Math.floor(Math.random() * NICK_NOUN.length)];
    return adj + noun;
}

function getFiscalYearStr(d = new Date()) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    return String(m >= 4 ? y : y - 1);
}

function createDefaultState() {
    return {
        profile: {
            setupDone: false,
            schoolYear: '',
            className: CFG.classes[0] || "1-1",
            nickname: rollRandomNickname(),
            dailyGoalMin: 60
        },
        customSubjects: [],
        selectedSubjectId: CFG.subjects[0].id,
        timerMode: 'pomo25',
        activeTimer: null, // { subjectId, mode, targetSec, startTime, goal }
        sessions: [],      // { id, date, subjectId, minutes, points, bonusKind, memo, mood, isManual, ts }
        gachaOwned: [],    // ["g01", ...]
        gachaSpunDates: [],// ["2026-11-22", ...]
        submittedDates: [],// ["2026-11-22", ...]
        todos: [
            { id: 't1', subjectId: 'math', text: 'ワーク試験範囲を1周する', done: false },
            { id: 't2', subjectId: 'english', text: '重要単語50個チェック', done: false },
            { id: 't3', subjectId: 'info', text: 'プリント見直し＆用語確認', done: false }
        ],
        weeklyPlan: createInitialWeeklyPlan(),
        examSetting: { name: '', date: '' },
        a11y: { theme: 'dark', fontScale: 'normal', cud: false, reducedMotion: false },
        reflection: { rating: '◎ 会心の出来！', memo: '', dismissed: false },
        ambientPref: {
            masterVol: 55,
            autoWithTimer: false,
            lastPreset: 'night_rain_cafe',
            lastMix: { rain_soft: 75, midnight: 45, synth_cafe: 55 }
        }
    };
}

let state = loadState();
let pendingSession = null;
let editingSessionId = null;
let lastDeletedSession = null;
let selectedMood = '◎ バッチリ';
let selectedReflectRating = state.reflection?.rating || '◎ 会心の出来！';
let timerTickId = null;
let breakEndAt = null;
let breakTickId = null;
let wakeLockSentinel = null;
let wakeLockEnabled = false;
let toastTimerId = null;
let pendingQrSyncCode = null;
let currentRankDept = 'classAvg';
let liveRankingRows = null; // 公開CSV読み込み成功時のみ格納
let selectedPlanDay = getTodayDayKey();
let selectedPlanPalette = { kind: 'study', itemId: 'english' };
let planSliderStart = 1140; // 19:00
let planSliderEnd = 1185;   // 19:45

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return createDefaultState();
        const parsed = JSON.parse(raw);
        const def = createDefaultState();
        const wp = (parsed.weeklyPlan && typeof parsed.weeklyPlan === 'object')
            ? { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [], ...parsed.weeklyPlan }
            : def.weeklyPlan;
        return {
            ...def,
            ...parsed,
            profile: { ...def.profile, ...(parsed.profile || {}) },
            customSubjects: Array.isArray(parsed.customSubjects) ? parsed.customSubjects : [],
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
            gachaOwned: Array.isArray(parsed.gachaOwned) ? parsed.gachaOwned : [],
            gachaSpunDates: Array.isArray(parsed.gachaSpunDates) ? parsed.gachaSpunDates : [],
            submittedDates: Array.isArray(parsed.submittedDates) ? parsed.submittedDates : [],
            todos: Array.isArray(parsed.todos) ? parsed.todos : def.todos,
            weeklyPlan: wp,
            examSetting: { name: '', date: '', ...(parsed.examSetting || {}) },
            a11y: { ...def.a11y, ...(parsed.a11y || {}) },
            reflection: { ...def.reflection, ...(parsed.reflection || {}) },
            ambientPref: { ...def.ambientPref, ...(parsed.ambientPref || {}) }
        };
    } catch (e) {
        return createDefaultState();
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
}

function getAllSubjects() {
    return [...CFG.subjects, ...state.customSubjects];
}

function getSubjectById(id) {
    return getAllSubjects().find(s => s.id === id) || CFG.subjects[0];
}

/* ============================================================================
   6. 集計ヘルパー（当日・累計・ストリーク・カフェ診断）
   ============================================================================ */
function getTodaySessions(dateStr = getTodayStr()) {
    return state.sessions.filter(s => s.date === dateStr);
}

function getTodaySummary(dateStr = getTodayStr()) {
    const list = getTodaySessions(dateStr);
    const totalMin = list.reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
    const basePt = list.reduce((acc, s) => acc + (Number(s.points) || 0), 0);
    const nowHour = new Date().getHours();
    const earlySleepBonus = (totalMin >= 15 && nowHour < CFG.rules.earlySleepBonusLimitHour)
        ? CFG.rules.earlySleepBonusPoints : 0;
    const effectivePt = Math.round(basePt + earlySleepBonus);
    const manualMin = list.filter(s => s.isManual).reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);
    const morningMin = list.filter(s => s.bonusKind === 'morning').reduce((acc, s) => acc + (Number(s.minutes) || 0), 0);

    const bySubject = {};
    list.forEach(s => {
        bySubject[s.subjectId] = (bySubject[s.subjectId] || 0) + (Number(s.minutes) || 0);
    });
    return { list, totalMin, basePt, earlySleepBonus, effectivePt, manualMin, morningMin, bySubject };
}

function getTotalSummary() {
    const totalMin = state.sessions.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
    const totalPt = state.sessions.reduce((a, s) => a + (Number(s.points) || 0), 0);
    const yen = Math.round(totalMin * 18.33); // 時給1,100円 ÷ 60分
    const bySubject = {};
    state.sessions.forEach(s => {
        bySubject[s.subjectId] = (bySubject[s.subjectId] || 0) + (Number(s.minutes) || 0);
    });
    return { totalMin, totalPt, yen, bySubject };
}

function getStreakDays() {
    const dateSet = new Set(state.sessions.filter(s => s.minutes > 0).map(s => s.date));
    if (dateSet.size === 0) return 0;
    let streak = 0;
    const cursor = new Date();
    // 今日まだ記録がない場合は昨日から数える
    if (!dateSet.has(getTodayStr(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
    }
    while (dateSet.has(getTodayStr(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function buildSubmissionPayload(dateStr = getTodayStr()) {
    const sum = getTodaySummary(dateStr);
    const streak = getStreakDays();
    const exam = getActiveExamInfo();
    const cls = state.profile.className || '1-1';
    const nick = (state.profile.nickname || 'ななしの虚無').replace(/\|/g, '');
    const breakdownParts = Object.entries(sum.bySubject)
        .sort((a, b) => b[1] - a[1])
        .map(([sid, min]) => `${getSubjectById(sid).name}:${min}分`);
    const breakdownText = breakdownParts.length ? breakdownParts.join(', ') : '未記録';
    const reportsText = sum.list.length
        ? sum.list.map(s => `[${getSubjectById(s.subjectId).name}${s.isManual ? '/事後' : ''}] ${s.memo}`).join(' / ')
        : '本日シフトなし';
    const chk = computeVerifyChecksum(dateStr, cls, nick, sum.totalMin, sum.effectivePt, CFG.securitySalt);
    const verifyCode = `KYM1|${dateStr}|${cls}|${nick}|${sum.totalMin}|${sum.effectivePt}|${streak}|${breakdownText}|CHK:${chk}`;
    return {
        examName: exam.name || '定期考査',
        date: dateStr,
        className: cls,
        nickname: nick,
        totalMinutes: sum.totalMin,
        effectivePoints: sum.effectivePt,
        earlySleepBonus: sum.earlySleepBonus,
        streakDays: streak,
        subjectBreakdown: breakdownText,
        dailyReports: reportsText,
        checksum: chk,
        verifyCode
    };
}

function buildGoogleFormPrefillUrl(payload) {
    const gf = CFG.googleForm;
    if (!gf || !gf.enabled || !gf.prefillBaseUrl) return '';
    const params = new URLSearchParams();
    params.set('usp', 'pp_url');
    const map = gf.entries || {};
    if (map.examName) params.set(map.examName, payload.examName);
    if (map.date) params.set(map.date, payload.date);
    if (map.className) params.set(map.className, payload.className);
    if (map.nickname) params.set(map.nickname, payload.nickname);
    if (map.totalMinutes) params.set(map.totalMinutes, String(payload.totalMinutes));
    if (map.effectivePoints) params.set(map.effectivePoints, String(payload.effectivePoints));
    if (map.subjectBreakdown) params.set(map.subjectBreakdown, payload.subjectBreakdown);
    if (map.dailyReports) params.set(map.dailyReports, payload.dailyReports);
    if (map.streakDays) params.set(map.streakDays, String(payload.streakDays));
    if (map.verifyCode) params.set(map.verifyCode, payload.verifyCode);
    const sep = gf.prefillBaseUrl.includes('?') ? '&' : '?';
    return `${gf.prefillBaseUrl}${sep}${params.toString()}`;
}

/* ============================================================================
   7. タイマー制御（スリープ耐性 Date.now 差分方式）
   ============================================================================ */
function getModeTargetSec(mode) {
    if (mode === 'pomo15') return 15 * 60;
    if (mode === 'pomo25') return 25 * 60;
    if (mode === 'pomo50') return 50 * 60;
    return 0; // free
}

function formatMMSS(sec) {
    const s = Math.max(0, Math.floor(sec));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

function getActiveTimerElapsedSec() {
    if (!state.activeTimer) return 0;
    const nowOrPause = state.activeTimer.pausedAt || Date.now();
    const pausedTotal = state.activeTimer.pausedTotalMs || 0;
    return Math.max(0, Math.floor((nowOrPause - state.activeTimer.startTime - pausedTotal) / 1000));
}

function startShiftTimer() {
    sound.playClick();
    stopBreakTimer();
    const goalEl = document.getElementById('input-mini-goal');
    const goal = goalEl ? goalEl.value.trim() : '';
    state.activeTimer = {
        subjectId: state.selectedSubjectId,
        mode: state.timerMode,
        targetSec: getModeTargetSec(state.timerMode),
        startTime: Date.now(),
        pausedAt: null,
        pausedTotalMs: 0,
        goal
    };
    ambient.setDucking(false);
    if (state.ambientPref?.autoWithTimer && ambient.getActiveTracks().length === 0) {
        const lastMix = state.ambientPref.lastMix || AMBIENT_PRESETS.night_rain_cafe.mix;
        ambient.applyMix(lastMix, state.ambientPref.lastPreset || 'custom');
        syncAmbientUI();
    }
    saveState();
    renderShiftTab();
    ensureTimerLoop();
}

function togglePauseTimer() {
    if (!state.activeTimer) return;
    sound.playClick();
    if (state.activeTimer.pausedAt) {
        // 再開（一時停止していた時間を差し引くため累積へ加算）
        state.activeTimer.pausedTotalMs = (state.activeTimer.pausedTotalMs || 0) + (Date.now() - state.activeTimer.pausedAt);
        state.activeTimer.pausedAt = null;
        ambient.setDucking(false);
        showToast('▶ シフトを再開しました！');
    } else {
        state.activeTimer.pausedAt = Date.now();
        ambient.setDucking(true);
        showToast('⏸️ 一時停止中（環境音もそっと下げています）');
    }
    saveState();
    updateTimerDisplay();
}

function ensureTimerLoop() {
    if (timerTickId) clearInterval(timerTickId);
    if (!state.activeTimer) return;
    updateTimerDisplay();
    timerTickId = setInterval(updateTimerDisplay, 500);
}

function syncFocusClockUI(clockStr, subj, subMsg) {
    const digEl = document.getElementById('focus-clock-digits');
    const subjEl = document.getElementById('focus-clock-subj');
    const charEl = document.getElementById('focus-clock-char');
    const subEl = document.getElementById('focus-clock-sub');
    const btnSP = document.getElementById('btn-focus-start-pause');
    const btnFin = document.getElementById('btn-focus-finish');
    if (digEl) digEl.textContent = clockStr;
    if (subjEl && subj) subjEl.textContent = `${subj.icon} ${subj.name}（${subj.charName}）`;
    if (charEl && subj) charEl.innerHTML = CHAR_SVGS[subj.charId] || CHAR_SVGS.penguin;
    if (subEl) subEl.textContent = subMsg;
    if (btnSP) {
        if (!state.activeTimer) btnSP.textContent = '▶ シフト開始';
        else btnSP.textContent = state.activeTimer.pausedAt ? '▶ 再開する' : '⏸️ 一時停止';
    }
    if (btnFin) btnFin.style.display = state.activeTimer ? 'inline-flex' : 'none';
}

function updateTimerDisplay() {
    const clockEl = document.getElementById('timer-clock');
    const barEl = document.getElementById('timer-progress-bar');
    const badgeEl = document.getElementById('timer-status-badge');
    const wrapEl = document.getElementById('timer-display-wrap');
    const subInfoEl = document.getElementById('timer-sub-info');
    const pauseBtn = document.getElementById('btn-timer-pause');
    const defaultTitle = 'テスト前夜の虚無バイト 〜StudyKYOMU+〜';

    if (!state.activeTimer) {
        const target = getModeTargetSec(state.timerMode);
        const clockStr = target > 0 ? formatMMSS(target) : '00:00';
        const subj = getSubjectById(state.selectedSubjectId);
        if (clockEl) clockEl.textContent = clockStr;
        if (barEl) barEl.style.width = '0%';
        if (badgeEl) badgeEl.textContent = '💤 待機中（時給1,100虚無円）';
        if (wrapEl) wrapEl.classList.remove('running');
        if (subInfoEl) subInfoEl.textContent = '画面スリープOK（開始時刻から自動計測）';
        if (!breakEndAt) document.title = defaultTitle;
        syncFocusClockUI(clockStr, subj, '待機中：開始ボタンでシフト出勤！');
        return;
    }

    const isPaused = Boolean(state.activeTimer.pausedAt);
    const elapsedSec = getActiveTimerElapsedSec();
    const maxSec = CFG.rules.maxSessionMinutes * 60;
    const clampedSec = Math.min(elapsedSec, maxSec);
    const subj = getSubjectById(state.activeTimer.subjectId);

    if (pauseBtn) pauseBtn.textContent = isPaused ? '▶ 再開' : '⏸️ 一時停止';
    if (wrapEl) wrapEl.classList.toggle('running', !isPaused);
    if (badgeEl) {
        const head = isPaused ? '⏸️ 一時停止中' : '🔥 シフト勤務中';
        badgeEl.textContent = `${head}：${subj.icon} ${subj.name}` + (state.activeTimer.goal ? `｜🎯 ${state.activeTimer.goal}` : '');
    }

    let clockStr = '00:00';
    let subMsg = '';
    if (state.activeTimer.targetSec > 0) {
        const remain = state.activeTimer.targetSec - clampedSec;
        if (remain <= 0 && !isPaused) {
            if (clockEl) clockEl.textContent = '00:00';
            if (barEl) barEl.style.width = '100%';
            document.title = defaultTitle;
            sound.playFanfare();
            finishShiftTimer(true);
            return;
        }
        clockStr = formatMMSS(remain);
        const pct = Math.min(100, (clampedSec / state.activeTimer.targetSec) * 100);
        if (barEl) barEl.style.width = `${pct.toFixed(1)}%`;
        subMsg = isPaused
            ? `一時停止中（経過 ${Math.floor(clampedSec / 60)}分${clampedSec % 60}秒）`
            : `経過 ${Math.floor(clampedSec / 60)}分${clampedSec % 60}秒（上限${CFG.rules.maxSessionMinutes}分）`;
    } else {
        clockStr = formatMMSS(clampedSec);
        const pct = Math.min(100, (clampedSec / maxSec) * 100);
        if (barEl) barEl.style.width = `${pct.toFixed(1)}%`;
        subMsg = isPaused
            ? `一時停止中（フリー計測）`
            : `フリー計測中（上限${CFG.rules.maxSessionMinutes}分で自動保護）`;
    }

    if (clockEl) clockEl.textContent = clockStr;
    if (subInfoEl) subInfoEl.textContent = subMsg;
    document.title = `${isPaused ? '⏸️' : '⏱️'} ${clockStr} ${subj.name}｜虚無バイト`;
    syncFocusClockUI(clockStr, subj, subMsg);
}

function finishShiftTimer(autoCompleted = false) {
    if (!state.activeTimer) return;
    if (timerTickId) {
        clearInterval(timerTickId);
        timerTickId = null;
    }
    const elapsedSec = getActiveTimerElapsedSec();
    let minutes = autoCompleted && state.activeTimer.targetSec > 0
        ? Math.round(state.activeTimer.targetSec / 60)
        : Math.round(elapsedSec / 60);

    // 10秒以上動かして「区切りよく終わる」を押した場合は、お試しでも使いやすいよう最小1分扱い
    if (elapsedSec >= 10 && minutes < 1) {
        minutes = 1;
    }

    if (minutes < CFG.rules.minSessionMinutes) {
        sound.playHarisen();
        showToast(`まだ${elapsedSec}秒しか経ってないよ！（10秒以上で1分として記録できます）`);
        ensureTimerLoop();
        return;
    }

    minutes = Math.min(minutes, CFG.rules.maxSessionMinutes);
    const bonus = getTimeZoneBonus();
    const points = Math.max(1, Math.round(minutes * bonus.mult));

    pendingSession = {
        subjectId: state.activeTimer.subjectId,
        minutes,
        points,
        bonusKind: bonus.kind,
        goal: state.activeTimer.goal,
        isManual: false
    };

    state.activeTimer = null;
    ambient.setDucking(false);
    if (state.ambientPref?.autoWithTimer && ambient.getActiveTracks().length > 0) {
        ambient.stopAll();
        syncAmbientUI();
    }
    saveState();
    closeModal('modal-focus-clock');
    renderShiftTab();
    openReportModal(pendingSession);
}

function cancelShiftTimer() {
    if (!state.activeTimer) return;
    if (!confirm('今回のシフト計測をキャンセルしますか？')) return;
    sound.playClick();
    if (timerTickId) {
        clearInterval(timerTickId);
        timerTickId = null;
    }
    state.activeTimer = null;
    ambient.setDucking(false);
    if (state.ambientPref?.autoWithTimer && ambient.getActiveTracks().length > 0) {
        ambient.stopAll();
        syncAmbientUI();
    }
    saveState();
    renderShiftTab();
}

/* ============================================================================
   8. 業務日報モーダル（チート防止ギミック）
   ============================================================================ */
function openReportModal(sess) {
    const subj = getSubjectById(sess.subjectId);
    const pillEl = document.getElementById('report-summary-pill');
    const tagEl = document.getElementById('report-char-tag');
    const msgEl = document.getElementById('report-char-msg');
    const memoEl = document.getElementById('input-report-memo');

    if (pillEl) {
        pillEl.textContent = `${subj.icon} ${subj.name}：${sess.minutes}分（+${sess.points}pt ／ +${Math.round(sess.minutes * 18.33)}虚無円）`;
    }
    if (tagEl) tagEl.textContent = `${subj.icon} ${subj.charName}`;
    if (msgEl) {
        msgEl.textContent = `「今やったことを${CFG.rules.minReportLength}文字以上で教えて！くれないと冷蔵庫のプリン食べちゃうよ…」`;
    }
    if (memoEl) {
        let draft = '';
        try { draft = sessionStorage.getItem('kyomu_report_draft') || ''; } catch (e) {}
        memoEl.value = draft || (sess.goal ? `${sess.goal}をやった！` : '');
        updateReportCounter();
    }
    selectedMood = '◎ バッチリ';
    document.querySelectorAll('#report-mood-btns .mood-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mood === selectedMood);
    });
    openModal('modal-report');
}

function updateReportCounter() {
    const memoEl = document.getElementById('input-report-memo');
    const cntEl = document.getElementById('report-char-counter');
    if (!memoEl || !cntEl) return;
    try { sessionStorage.setItem('kyomu_report_draft', memoEl.value); } catch (e) {}
    const len = memoEl.value.trim().length;
    const minLen = CFG.rules.minReportLength;
    cntEl.textContent = `${len} / ${minLen}文字以上`;
    cntEl.classList.toggle('ok', len >= minLen);
}

function submitReportModal() {
    if (!pendingSession) return;
    const memoEl = document.getElementById('input-report-memo');
    const memo = memoEl ? memoEl.value.trim() : '';
    if (memo.length < CFG.rules.minReportLength) {
        sound.playHarisen();
        showToast(`業務日報は${CFG.rules.minReportLength}文字以上入力してね！`);
        return;
    }

    const record = {
        id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: getTodayStr(),
        subjectId: pendingSession.subjectId,
        minutes: pendingSession.minutes,
        points: pendingSession.points,
        bonusKind: pendingSession.bonusKind,
        memo,
        mood: selectedMood,
        isManual: false,
        ts: Date.now()
    };
    state.sessions.unshift(record);
    pendingSession = null;
    try { sessionStorage.removeItem('kyomu_report_draft'); } catch (e) {}
    saveState();

    sound.playSuccess();
    closeModal('modal-report');
    const goalEl = document.getElementById('input-mini-goal');
    if (goalEl) goalEl.value = '';
    renderAll();
    offerBreakTimer();
    showToast(`💰 記録完了！+${record.minutes}分（+${record.points}pt）`);
}

/* ============================================================================
   9. 紙ノート事後申請
   ============================================================================ */
function openManualModal() {
    sound.playClick();
    const sel = document.getElementById('manual-subject');
    if (sel) {
        sel.innerHTML = getAllSubjects().map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.icon + ' ' + s.name)}</option>`).join('');
        sel.value = state.selectedSubjectId;
    }
    const memoEl = document.getElementById('manual-memo');
    if (memoEl) memoEl.value = '';
    openModal('modal-manual');
}

function submitManualRecord() {
    const selEl = document.getElementById('manual-subject');
    const minEl = document.getElementById('manual-minutes');
    const memoEl = document.getElementById('manual-memo');
    if (!selEl || !minEl || !memoEl) return;

    const minutes = Math.max(1, Math.min(CFG.rules.maxSessionMinutes, parseInt(minEl.value, 10) || 0));
    const memo = memoEl.value.trim();
    if (memo.length < CFG.rules.minReportLength) {
        sound.playHarisen();
        alert(`やったことメモを${CFG.rules.minReportLength}文字以上入力してね！`);
        return;
    }

    const todaySum = getTodaySummary();
    if (todaySum.manualMin + minutes > CFG.rules.maxManualPerDayMinutes) {
        sound.playHarisen();
        alert(`紙ノート事後申請は1日上限${CFG.rules.maxManualPerDayMinutes}分までだよ！（本日残り ${Math.max(0, CFG.rules.maxManualPerDayMinutes - todaySum.manualMin)}分）`);
        return;
    }

    const bonus = getTimeZoneBonus();
    const record = {
        id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        date: getTodayStr(),
        subjectId: selEl.value,
        minutes,
        points: Math.max(1, Math.round(minutes * Math.min(1.0, bonus.mult))), // 事後申請は朝勉倍率なし（タイマー推奨）
        bonusKind: bonus.kind === 'latenight' ? 'latenight' : 'normal',
        memo,
        mood: '📝 事後申請',
        isManual: true,
        ts: Date.now()
    };
    state.sessions.unshift(record);
    saveState();
    sound.playSuccess();
    closeModal('modal-manual');
    renderAll();
}

/* ============================================================================
   10. 各画面レンダリング
   ============================================================================ */
function renderHeader() {
    const exam = getActiveExamInfo();
    const examPill = document.getElementById('header-exam-pill');
    if (examPill) {
        if (exam.daysLeft === null) {
            examPill.textContent = `📝 ${exam.name}（タップで日程設定 ✏️）`;
        } else if (exam.daysLeft > 0) {
            examPill.textContent = `📝 ${exam.name}まで あと${exam.daysLeft}日（30分×${exam.daysLeft * 2}セット分） ✏️`;
        } else {
            examPill.textContent = `🔥 ${exam.name} 本番期間中！ ✏️`;
        }
    }
    const bonus = getTimeZoneBonus();
    const bonusPill = document.getElementById('header-bonus-pill');
    if (bonusPill) {
        bonusPill.textContent = bonus.label;
        bonusPill.className = 'time-bonus-pill ' + bonus.kind;
    }
    const hdrCls = document.getElementById('hdr-class');
    const hdrNick = document.getElementById('hdr-nick');
    if (hdrCls) hdrCls.textContent = state.profile.className || '未設定';
    if (hdrNick) hdrNick.textContent = state.profile.nickname || 'ななしの虚無';

    // 未提出ドット通知
    const todaySum = getTodaySummary();
    const dot = document.getElementById('nav-taikin-dot');
    if (dot) {
        const unsubmitted = todaySum.totalMin > 0 && !state.submittedDates.includes(getTodayStr());
        dot.style.display = unsubmitted ? 'inline-block' : 'none';
    }
}

function renderShiftTab() {
    const todaySum = getTodaySummary();
    const totalSum = getTotalSummary();
    const streak = getStreakDays();

    const kMin = document.getElementById('kpi-today-min');
    const kPt = document.getElementById('kpi-today-pt');
    const kStr = document.getElementById('kpi-streak');
    const kYen = document.getElementById('kpi-yen');
    if (kMin) kMin.textContent = `${todaySum.totalMin}分`;
    if (kPt) kPt.textContent = `${todaySum.effectivePt}pt`;
    if (kStr) kStr.textContent = `${streak}日`;
    if (kYen) kYen.textContent = `${totalSum.yen.toLocaleString()}円`;

    // 担当キャラ表示
    const activeSubj = getSubjectById(state.activeTimer ? state.activeTimer.subjectId : state.selectedSubjectId);
    const svgEl = document.getElementById('active-char-svg');
    const nameEl = document.getElementById('active-char-name');
    const mutterEl = document.getElementById('active-char-mutter');
    if (svgEl) svgEl.innerHTML = CHAR_SVGS[activeSubj.charId] || CHAR_SVGS.penguin;
    if (nameEl) nameEl.textContent = `${activeSubj.icon} ${activeSubj.name}担当：${activeSubj.charName}`;
    if (mutterEl) {
        const bonus = getTimeZoneBonus();
        if (bonus.kind === 'latenight') {
            mutterEl.textContent = '「23:30以降は労基署と保健室の先生が来るよ…深夜は0.5倍だから早く寝ようね…」';
        } else if (bonus.kind === 'morning') {
            mutterEl.textContent = `「おおっ、早朝シフト偉すぎ！今なら朝勉手当${CFG.rules.morningMultiplier}倍だよ！」`;
        } else {
            const lines = activeSubj.mutters || ['「15分だけシフト入って早く帰って寝よう…」'];
            const pick = lines[Math.floor(Date.now() / 30000) % lines.length];
            mutterEl.textContent = `「${pick}」`;
        }
    }

    // モードピル
    document.querySelectorAll('#timer-mode-pills .mode-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === state.timerMode);
        btn.disabled = Boolean(state.activeTimer);
    });

    // 開始/稼働ボタン切替
    const startBtn = document.getElementById('btn-timer-start');
    const runActs = document.getElementById('running-actions');
    if (startBtn && runActs) {
        startBtn.style.display = state.activeTimer ? 'none' : 'block';
        runActs.style.display = state.activeTimer ? 'flex' : 'none';
    }

    // 科目グリッド
    const grid = document.getElementById('subject-grid');
    if (grid) {
        grid.innerHTML = getAllSubjects().map(s => `
            <button type="button" class="subject-btn ${s.id === state.selectedSubjectId ? 'active' : ''}"
                data-subj="${escapeHtml(s.id)}" style="--subj-color:${escapeHtml(s.color)};"
                ${state.activeTimer ? 'disabled' : ''}>
                <span class="subj-ic">${escapeHtml(s.icon)}</span>
                <span class="subj-meta">
                    <span class="subj-name">${escapeHtml(s.name)}</span>
                    <span class="subj-menu">${escapeHtml(s.menuIcon + ' ' + s.menuName)}</span>
                </span>
            </button>
        `).join('');
    }

    // 今日の履歴（編集・削除＋Undo対応）
    const listEl = document.getElementById('today-sessions-list');
    if (listEl) {
        if (!todaySum.list.length) {
            listEl.innerHTML = '<div class="session-empty">まだ今日のシフト記録はないよ。まずは15分だけ出勤してみよう！</div>';
        } else {
            listEl.innerHTML = todaySum.list.map(s => {
                const subj = getSubjectById(s.subjectId);
                return `
                    <div class="session-item" style="--subj-color:${escapeHtml(subj.color)};">
                        <div class="session-top">
                            <span>${escapeHtml(subj.icon + ' ' + subj.name)} ${s.isManual ? '<small>(事後)</small>' : ''}</span>
                            <span>
                                ${s.minutes}分 (+${s.points}pt)
                                <span class="session-actions">
                                    <button type="button" class="sess-act-btn" data-edit-sess="${escapeHtml(s.id)}" title="この記録を修正">✏️</button>
                                    <button type="button" class="sess-act-btn" data-del-sess="${escapeHtml(s.id)}" title="この記録を削除">🗑️</button>
                                </span>
                            </span>
                        </div>
                        <div class="session-memo">${escapeHtml(s.mood || '')}｜${escapeHtml(s.memo)}</div>
                    </div>
                `;
            }).join('');
        }
    }

    renderPrevExamMemoBar();
    renderTodayPlanStrip();
    updateTimerDisplay();
}

/* ============================================================================
   10.5 1週間学習計画スライダー（非重複配置・右端ドラッグ・PDF出力）
   ============================================================================ */
function getPlanItemMeta(block) {
    if (block.kind === 'life') {
        const found = LIFE_ACTIVITIES.find(a => a.id === block.itemId) || LIFE_ACTIVITIES[0];
        return { name: found.name, icon: found.icon, color: found.color, isStudy: false };
    }
    const subj = getSubjectById(block.itemId);
    return { name: subj.name, icon: subj.icon, color: subj.color, isStudy: true };
}

function getDayStudyMinutes(dayKey) {
    const list = state.weeklyPlan[dayKey] || [];
    return list.filter(b => b.kind === 'study').reduce((a, b) => a + Math.max(0, b.endMin - b.startMin), 0);
}

/**
 * 既存ブロックとの重複を自動で削る・分割して非重複＆昇順を100%保証する
 */
function upsertPlanBlock(dayKey, newBlock) {
    const start = Math.max(PLAN_MIN, Math.min(PLAN_MAX - 15, newBlock.startMin));
    const end = Math.max(start + 15, Math.min(PLAN_MAX, newBlock.endMin));
    const existing = state.weeklyPlan[dayKey] || [];
    const next = [];

    existing.forEach(blk => {
        if (blk.id === newBlock.id) return;
        // 重複なし
        if (blk.endMin <= start || blk.startMin >= end) {
            next.push(blk);
            return;
        }
        // 新規ブロックが既存を完全に包含 → 既存削除
        if (start <= blk.startMin && end >= blk.endMin) {
            return;
        }
        // 既存ブロックの中央をくり抜く → 前後に分割
        if (blk.startMin < start && blk.endMin > end) {
            next.push({ ...blk, id: blk.id + '_a', endMin: start });
            next.push({ ...blk, id: blk.id + '_b', startMin: end });
            return;
        }
        // 後ろだけ重なる → 既存を左に縮める
        if (blk.startMin < start && blk.endMin > start) {
            if (start - blk.startMin >= 15) next.push({ ...blk, endMin: start });
            return;
        }
        // 前だけ重なる → 既存を右に縮める
        if (blk.startMin < end && blk.endMin > end) {
            if (blk.endMin - end >= 15) next.push({ ...blk, startMin: end });
        }
    });

    next.push({
        id: newBlock.id || `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        startMin: start,
        endMin: end,
        kind: newBlock.kind,
        itemId: newBlock.itemId
    });
    next.sort((a, b) => a.startMin - b.startMin);
    state.weeklyPlan[dayKey] = next;
    saveState();
}

function updateDualSliderUI() {
    const sEl = document.getElementById('slider-start');
    const eEl = document.getElementById('slider-end');
    const fillEl = document.getElementById('dual-slider-fill');
    const pillEl = document.getElementById('slider-range-pill');

    if (sEl) sEl.value = String(planSliderStart);
    if (eEl) eEl.value = String(planSliderEnd);

    const span = PLAN_MAX - PLAN_MIN;
    const leftPct = ((planSliderStart - PLAN_MIN) / span) * 100;
    const widthPct = ((planSliderEnd - planSliderStart) / span) * 100;
    const meta = getPlanItemMeta(selectedPlanPalette);

    if (fillEl) {
        fillEl.style.left = `${leftPct.toFixed(2)}%`;
        fillEl.style.width = `${widthPct.toFixed(2)}%`;
        fillEl.style.background = meta.color;
    }
    if (pillEl) {
        const dur = planSliderEnd - planSliderStart;
        pillEl.textContent = `${formatPlanTime(planSliderStart)} 〜 ${formatPlanTime(planSliderEnd)}（${dur}分）`;
    }
}

function diagnoseWeeklyPlan() {
    const allBlocks = PLAN_DAYS.flatMap(d => state.weeklyPlan[d.key] || []);
    const studyBlocks = allBlocks.filter(b => b.kind === 'study');
    const lifeBlocks = allBlocks.filter(b => b.kind === 'life');
    const totalStudyMin = studyBlocks.reduce((a, b) => a + (b.endMin - b.startMin), 0);

    if (!allBlocks.length) {
        return 'まだ1週間の計画が空っぽペン！上の「✨ おまかせテンプレ」か、スライダーで英語やお風呂を置いてみようペン！';
    }
    const hasLateStudy = studyBlocks.some(b => b.endMin > 23 * 60 + 30);
    if (hasLateStudy) {
        return '23:30以降の勉強予定が入ってるペン…深夜は労基ブレーキ0.5倍だから、早めに寝て朝に回すのが最強ペン！';
    }
    const hasMorningStudy = studyBlocks.some(b => b.startMin < 8 * 60);
    if (hasMorningStudy) {
        return 'おおっ！朝5:00〜8:00の朝勉ブロック発見ペン！本番は1.2倍ボーナスが付いて効率バグるペン！';
    }
    if (studyBlocks.length >= 3 && !lifeBlocks.some(b => b.itemId === 'bath' || b.itemId === 'sleep' || b.itemId === 'break')) {
        return '勉強ばっかりでお風呂や睡眠が入ってないペン！ちゃんと休憩も組み込まないと続かないペンよ！';
    }
    const subjSet = new Set(studyBlocks.map(b => b.itemId));
    if (studyBlocks.length >= 3 && subjSet.size === 1) {
        const only = getSubjectById(Array.from(subjSet)[0]);
        return `今週ずっと「${only.name}」だけの計画になってるペン！他の教科も15〜30分ずつ混ぜると点数伸びるペン！`;
    }
    const hrs = (totalStudyMin / 60).toFixed(1);
    return `今週の勉強予定は合計 ${hrs}時間（${subjSet.size}教科）ペン！生活リズムと両立できててめっちゃ現実的ペン！`;
}

function renderTodayPlanStrip() {
    const strip = document.getElementById('today-plan-strip');
    if (!strip) return;
    const todayKey = getTodayDayKey();
    const studyList = (state.weeklyPlan[todayKey] || []).filter(b => b.kind === 'study');
    if (!studyList.length) {
        strip.style.display = 'none';
        return;
    }
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const nextBlk = studyList.find(b => b.endMin > nowMin) || studyList[0];
    const meta = getPlanItemMeta(nextBlk);
    const dur = nextBlk.endMin - nextBlk.startMin;

    strip.style.display = 'flex';
    strip.innerHTML = `
        <div class="today-plan-strip-left">
            <span class="plan-pill cyan">📅 今日の計画</span>
            <span>${formatPlanTime(nextBlk.startMin)}〜${formatPlanTime(nextBlk.endMin)}</span>
            <strong>${escapeHtml(meta.icon + ' ' + meta.name)}（${dur}分）</strong>
        </div>
        <button type="button" class="btn-mini-primary" id="btn-apply-today-plan"
            data-subj="${escapeHtml(nextBlk.itemId)}" data-dur="${dur}">
            ▶ この教科をセット
        </button>
    `;
    const applyBtn = document.getElementById('btn-apply-today-plan');
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            if (state.activeTimer) return;
            sound.playLightOn();
            state.selectedSubjectId = applyBtn.dataset.subj;
            const d = parseInt(applyBtn.dataset.dur, 10) || 25;
            state.timerMode = d <= 20 ? 'pomo15' : (d >= 45 ? 'pomo50' : 'pomo25');
            saveState();
            renderShiftTab();
        });
    }
}

function renderPlanTab() {
    const weekStudyMin = PLAN_DAYS.reduce((a, d) => a + getDayStudyMinutes(d.key), 0);
    const dayStudyMin = getDayStudyMinutes(selectedPlanDay);
    const dayMeta = PLAN_DAYS.find(d => d.key === selectedPlanDay) || PLAN_DAYS[0];
    const todayKey = getTodayDayKey();

    const wkEl = document.getElementById('plan-week-study-total');
    const dyEl = document.getElementById('plan-day-study-total');
    const diagEl = document.getElementById('plan-diagnosis-text');
    const titleEl = document.getElementById('plan-edit-day-title');
    if (wkEl) wkEl.textContent = `📚 週間勉強予定：${(weekStudyMin / 60).toFixed(1)}時間`;
    if (dyEl) dyEl.textContent = `📌 ${dayMeta.label}曜日の勉強：${dayStudyMin}分`;
    if (diagEl) diagEl.textContent = `「${diagnoseWeeklyPlan()}」`;
    if (titleEl) titleEl.textContent = `📝 ${dayMeta.full}の予定をスライダーで配置`;

    // 曜日タブ
    const dayTabsEl = document.getElementById('plan-day-tabs');
    if (dayTabsEl) {
        dayTabsEl.innerHTML = PLAN_DAYS.map(d => {
            const m = getDayStudyMinutes(d.key);
            const active = d.key === selectedPlanDay;
            const isToday = d.key === todayKey;
            return `
                <button type="button" class="day-tab-btn ${active ? 'active' : ''} ${isToday ? 'is-today' : ''}" data-pday="${d.key}">
                    <span class="day-tab-lbl">${d.label}${isToday ? '・今日' : ''}</span>
                    <span class="day-tab-sub">${m > 0 ? m + 'm' : '-'}</span>
                </button>
            `;
        }).join('');
    }

    // パレット（勉強＆生活）
    const studyPal = document.getElementById('plan-study-palette');
    if (studyPal) {
        studyPal.innerHTML = getAllSubjects().map(s => {
            const act = selectedPlanPalette.kind === 'study' && selectedPlanPalette.itemId === s.id;
            return `
                <button type="button" class="pal-chip ${act ? 'active' : ''}" data-pkind="study" data-pid="${escapeHtml(s.id)}"
                    style="--chip-color:${escapeHtml(s.color)};">
                    ${escapeHtml(s.icon)} ${escapeHtml(s.name)}
                </button>
            `;
        }).join('');
    }
    const lifePal = document.getElementById('plan-life-palette');
    if (lifePal) {
        lifePal.innerHTML = LIFE_ACTIVITIES.map(a => {
            const act = selectedPlanPalette.kind === 'life' && selectedPlanPalette.itemId === a.id;
            return `
                <button type="button" class="pal-chip ${act ? 'active' : ''}" data-pkind="life" data-pid="${escapeHtml(a.id)}"
                    style="--chip-color:${escapeHtml(a.color)};">
                    ${escapeHtml(a.icon)} ${escapeHtml(a.name)}
                </button>
            `;
        }).join('');
    }

    updateDualSliderUI();

    // 選択日のタイムラインバー（右端ドラッグで伸縮可能）
    const blocks = state.weeklyPlan[selectedPlanDay] || [];
    const canvas = document.getElementById('day-bar-canvas');
    const span = PLAN_MAX - PLAN_MIN;
    if (canvas) {
        canvas.innerHTML = blocks.map(blk => {
            const meta = getPlanItemMeta(blk);
            const leftPct = ((blk.startMin - PLAN_MIN) / span) * 100;
            const widthPct = ((blk.endMin - blk.startMin) / span) * 100;
            const showName = (blk.endMin - blk.startMin) >= 120;
            return `
                <div class="tblock" data-blkid="${escapeHtml(blk.id)}" data-kind="${escapeHtml(blk.kind)}"
                    style="left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%; background:${escapeHtml(meta.color)};"
                    title="${escapeHtml(formatPlanTime(blk.startMin) + '〜' + formatPlanTime(blk.endMin) + ' ' + meta.name)}">
                    <span>${escapeHtml(meta.icon)}${showName ? ' ' + escapeHtml(meta.name) : ''}</span>
                    <div class="tblock-handle" data-resize-blkid="${escapeHtml(blk.id)}" title="ドラッグで終了時刻を調整"></div>
                </div>
            `;
        }).join('');
    }

    // 選択日のブロック一覧
    const listEl = document.getElementById('plan-block-list');
    if (listEl) {
        if (!blocks.length) {
            listEl.innerHTML = '<div class="session-empty">この日の予定はまだ空っぽだよ。左のスライダーで時間帯を選んで配置してね！</div>';
        } else {
            listEl.innerHTML = blocks.map(blk => {
                const meta = getPlanItemMeta(blk);
                const dur = blk.endMin - blk.startMin;
                return `
                    <div class="pblock-row" style="--blk-color:${escapeHtml(meta.color)};">
                        <div class="pblock-left" data-load-blkid="${escapeHtml(blk.id)}" title="タップしてスライダーへ読込">
                            <span class="pblock-time">${formatPlanTime(blk.startMin)}〜${formatPlanTime(blk.endMin)}</span>
                            <span class="pblock-name">${escapeHtml(meta.icon + ' ' + meta.name)}</span>
                            <span class="pblock-dur">(${dur}分)</span>
                        </div>
                        <div class="pblock-btns">
                            ${meta.isStudy ? `<button type="button" class="pblock-act go" data-start-blkid="${escapeHtml(blk.id)}">▶ 勉強</button>` : ''}
                            <button type="button" class="pblock-act del" data-del-blkid="${escapeHtml(blk.id)}">✖</button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 1週間7日間まとめ俯瞰ビュー
    const ovGrid = document.getElementById('week-overview-grid');
    if (ovGrid) {
        ovGrid.innerHTML = PLAN_DAYS.map(d => {
            const dBlocks = state.weeklyPlan[d.key] || [];
            const dStudy = getDayStudyMinutes(d.key);
            const segs = dBlocks.map(blk => {
                const meta = getPlanItemMeta(blk);
                const leftPct = ((blk.startMin - PLAN_MIN) / span) * 100;
                const widthPct = ((blk.endMin - blk.startMin) / span) * 100;
                return `<div class="wov-seg" data-kind="${escapeHtml(blk.kind)}" style="left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%; background:${escapeHtml(meta.color)};" title="${escapeHtml(formatPlanTime(blk.startMin) + '〜' + formatPlanTime(blk.endMin) + ' ' + meta.name)}">${escapeHtml(meta.icon)}</div>`;
            }).join('');
            return `
                <div class="wov-row ${d.key === selectedPlanDay ? 'active' : ''}" data-ovday="${d.key}">
                    <div class="wov-day">${d.label}曜日${d.key === todayKey ? '★' : ''}</div>
                    <div class="wov-bar">${segs}</div>
                    <div class="wov-min">${dStudy}分</div>
                </div>
            `;
        }).join('');
    }

    renderPlanVsActual();
}

function renderPlanVsActual() {
    const wrap = document.getElementById('plan-vs-actual-wrap');
    const ratePill = document.getElementById('plan-overall-rate');
    if (!wrap) return;

    // 1週間の教科別予定分
    const planBySubj = {};
    PLAN_DAYS.forEach(d => {
        (state.weeklyPlan[d.key] || []).forEach(b => {
            if (b.kind === 'study') {
                planBySubj[b.itemId] = (planBySubj[b.itemId] || 0) + (b.endMin - b.startMin);
            }
        });
    });

    // 直近7日間の実績分
    const weekDates = new Set();
    for (let i = 0; i < 7; i++) {
        const dt = new Date();
        dt.setDate(dt.getDate() - i);
        weekDates.add(getTodayStr(dt));
    }
    const actualBySubj = {};
    state.sessions.forEach(s => {
        if (weekDates.has(s.date)) {
            actualBySubj[s.subjectId] = (actualBySubj[s.subjectId] || 0) + (Number(s.minutes) || 0);
        }
    });

    const subjIds = Array.from(new Set([...Object.keys(planBySubj), ...Object.keys(actualBySubj)]));
    const totalPlan = Object.values(planBySubj).reduce((a, b) => a + b, 0);
    const totalActual = Object.values(actualBySubj).reduce((a, b) => a + b, 0);
    const overallPct = totalPlan > 0 ? Math.min(999, Math.round((totalActual / totalPlan) * 100)) : 0;
    if (ratePill) ratePill.textContent = `総合達成率 ${overallPct}%（${totalActual} / ${totalPlan}分）`;

    if (!subjIds.length) {
        wrap.innerHTML = '<div class="session-empty">計画または勉強記録が入ると、科目ごとの達成率バーがここに表示されます！</div>';
        return;
    }
    wrap.innerHTML = subjIds.map(sid => {
        const s = getSubjectById(sid);
        const pMin = planBySubj[sid] || 0;
        const aMin = actualBySubj[sid] || 0;
        const pct = pMin > 0 ? Math.round((aMin / pMin) * 100) : (aMin > 0 ? 100 : 0);
        const barW = Math.min(100, pct);
        return `
            <div class="pva-row">
                <div class="pva-head">
                    <span>${escapeHtml(s.icon + ' ' + s.name)}</span>
                    <span>${aMin} / ${pMin}分（<strong>${pct}%</strong>）</span>
                </div>
                <div class="pva-track">
                    <div class="pva-fill" style="width:${barW}%; background:${escapeHtml(s.color)};"></div>
                </div>
            </div>
        `;
    }).join('');
}

function applyWeeklyPlanTemplate() {
    sound.playSuccess();
    const makeWeekday = (s1, s2, s3) => [
        { id: `tp_${s1}_1`, startMin: 510,  endMin: 960,  kind: 'life',  itemId: 'school' }, // 08:30-16:00 学校
        { id: `tp_${s1}_2`, startMin: 1020, endMin: 1065, kind: 'study', itemId: s1 },       // 17:00-17:45 教科1
        { id: `tp_${s1}_3`, startMin: 1080, endMin: 1140, kind: 'life',  itemId: 'meal' },   // 18:00-19:00 ごはん
        { id: `tp_${s1}_4`, startMin: 1140, endMin: 1185, kind: 'study', itemId: s2 },       // 19:00-19:45 教科2
        { id: `tp_${s1}_5`, startMin: 1185, endMin: 1215, kind: 'life',  itemId: 'bath' },   // 19:45-20:15 お風呂
        { id: `tp_${s1}_6`, startMin: 1230, endMin: 1290, kind: 'study', itemId: s3 },       // 20:30-21:30 教科3
        { id: `tp_${s1}_7`, startMin: 1290, endMin: 1350, kind: 'life',  itemId: 'break' },  // 21:30-22:30 休憩
        { id: `tp_${s1}_8`, startMin: 1380, endMin: 1440, kind: 'life',  itemId: 'sleep' }   // 23:00-24:00 睡眠
    ];
    const makeWeekend = (s1, s2, s3, s4) => [
        { id: `tw_${s1}_1`, startMin: 540,  endMin: 600,  kind: 'study', itemId: s1 },       // 09:00-10:00 教科1
        { id: `tw_${s1}_2`, startMin: 630,  endMin: 690,  kind: 'study', itemId: s2 },       // 10:30-11:30 教科2
        { id: `tw_${s1}_3`, startMin: 720,  endMin: 780,  kind: 'life',  itemId: 'meal' },   // 12:00-13:00 ごはん
        { id: `tw_${s1}_4`, startMin: 840,  endMin: 900,  kind: 'study', itemId: s3 },       // 14:00-15:00 教科3
        { id: `tw_${s1}_5`, startMin: 900,  endMin: 990,  kind: 'life',  itemId: 'break' },  // 15:00-16:30 休憩
        { id: `tw_${s1}_6`, startMin: 1140, endMin: 1200, kind: 'study', itemId: s4 },       // 19:00-20:00 教科4
        { id: `tw_${s1}_7`, startMin: 1200, endMin: 1230, kind: 'life',  itemId: 'bath' },   // 20:00-20:30 お風呂
        { id: `tw_${s1}_8`, startMin: 1380, endMin: 1440, kind: 'life',  itemId: 'sleep' }   // 23:00-24:00 睡眠
    ];

    state.weeklyPlan = {
        mon: makeWeekday('english', 'math', 'japanese'),
        tue: makeWeekday('math', 'science', 'info'),
        wed: makeWeekday('english', 'social', 'math'),
        thu: makeWeekday('japanese', 'science', 'english'),
        fri: makeWeekday('info', 'math', 'other'),
        sat: makeWeekend('math', 'english', 'science', 'social'),
        sun: makeWeekend('japanese', 'info', 'english', 'math')
    };
    saveState();
    renderPlanTab();
    renderTodayPlanStrip();
}

function exportWeeklyPlanPdf() {
    sound.playClick();
    const weekStudyMin = PLAN_DAYS.reduce((a, d) => a + getDayStudyMinutes(d.key), 0);
    const rowsHtml = PLAN_DAYS.map(d => {
        const list = state.weeklyPlan[d.key] || [];
        const studyMin = getDayStudyMinutes(d.key);
        const text = list.length
            ? list.map(b => {
                const m = getPlanItemMeta(b);
                return `${formatPlanTime(b.startMin)}-${formatPlanTime(b.endMin)} ${m.icon}${m.name}`;
            }).join(' ／ ')
            : '（未設定）';
        return `<tr><td style="white-space:nowrap;"><strong>${d.full}</strong><br>${studyMin}分</td><td>${escapeHtml(text)}</td></tr>`;
    }).join('');

    const printRoot = document.getElementById('print-receipt-root');
    if (printRoot) {
        const exam = getActiveExamInfo();
        const examLabel = exam.daysLeft !== null ? `${exam.name}（あと${exam.daysLeft}日）` : exam.name;
        printRoot.innerHTML = `
            <div class="plan-print-sheet">
                <h2>📅 テスト前夜の虚無バイト｜1週間シフト計画表</h2>
                <div style="font-size:0.78rem; color:#444;">
                    ${escapeHtml(CFG.schoolName)} ｜ ${escapeHtml(examLabel)} ｜
                    ${escapeHtml(state.profile.className)}｜${escapeHtml(state.profile.nickname)} ｜
                    週間勉強予定：<strong>${(weekStudyMin / 60).toFixed(1)}時間</strong>
                </div>
                <table class="plan-print-table">
                    <thead><tr><th style="width:74px;">曜日・勉強</th><th>タイムスケジュール（5:00〜24:00）</th></tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                <div style="margin-top:8px; font-size:0.74rem;">🐧 計画チェック：${escapeHtml(diagnoseWeeklyPlan())}</div>
            </div>
        `;
    }
    setTimeout(() => { window.print(); }, 80);
}

function setupPlanResizeDrag() {
    const canvas = document.getElementById('day-bar-canvas');
    if (!canvas) return;
    let dragging = null;

    canvas.addEventListener('pointerdown', e => {
        const handle = e.target.closest('.tblock-handle');
        if (!handle) {
            // ブロック本体タップ → スライダーへ読込
            const blkEl = e.target.closest('.tblock');
            if (blkEl) {
                const blk = (state.weeklyPlan[selectedPlanDay] || []).find(b => b.id === blkEl.dataset.blkid);
                if (blk) {
                    sound.playClick();
                    planSliderStart = blk.startMin;
                    planSliderEnd = blk.endMin;
                    selectedPlanPalette = { kind: blk.kind, itemId: blk.itemId };
                    renderPlanTab();
                }
            }
            return;
        }
        e.preventDefault();
        const blkId = handle.dataset.resizeBlkid;
        const blk = (state.weeklyPlan[selectedPlanDay] || []).find(b => b.id === blkId);
        if (!blk) return;
        dragging = { blkId, startMin: blk.startMin, kind: blk.kind, itemId: blk.itemId };
        if (handle.setPointerCapture) {
            try { handle.setPointerCapture(e.pointerId); } catch (err) {}
        }
    });

    window.addEventListener('pointermove', e => {
        if (!dragging) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const rawMin = PLAN_MIN + ratio * (PLAN_MAX - PLAN_MIN);
        const snapped = Math.max(dragging.startMin + 15, Math.min(PLAN_MAX, Math.round(rawMin / 15) * 15));
        const blk = (state.weeklyPlan[selectedPlanDay] || []).find(b => b.id === dragging.blkId);
        if (blk && blk.endMin !== snapped) {
            upsertPlanBlock(selectedPlanDay, {
                id: dragging.blkId,
                startMin: dragging.startMin,
                endMin: snapped,
                kind: dragging.kind,
                itemId: dragging.itemId
            });
            renderPlanTab();
            renderTodayPlanStrip();
        }
    });

    window.addEventListener('pointerup', () => {
        if (dragging) {
            sound.playClick();
            dragging = null;
        }
    });
}

function renderCafeTab() {
    const total = getTotalSummary();
    const subjects = getAllSubjects();
    const min = total.totalMin;

    // お店レベル診断
    let levelLabel = 'Lv.1 休業寸前のボロ屋台';
    if (min >= 900) levelLabel = 'Lv.6 伝説の五つ星・虚無ビストロ';
    else if (min >= 600) levelLabel = 'Lv.5 深夜の大繁盛ネオンカフェ';
    else if (min >= 360) levelLabel = 'Lv.4 テスト前夜の人気ダイナー';
    else if (min >= 180) levelLabel = 'Lv.3 常連がつき始めたカフェ';
    else if (min >= 45)  levelLabel = 'Lv.2 とりあえず開店した屋台';

    const entries = Object.entries(total.bySubject).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
    let balanceTag = 'バランス：未開店';
    let diagText = 'まだ料理が1皿もないニャ…まずは15分シフト入ってメニューを増やすニャ…';

    if (entries.length > 0) {
        const topSubj = getSubjectById(entries[0][0]);
        const topRatio = entries[0][1] / Math.max(1, min);
        if (entries.length === 1 || topRatio >= 0.6) {
            balanceTag = `⚠️ ${topSubj.menuName}専門店化`;
            diagText = `お店が「${topSubj.menuName}専門店（${topSubj.name} ${Math.round(topRatio * 100)}%）」になってるニャ！他の教科も15分だけ仕込むと五つ星に近づくニャ！`;
        } else if (entries.length >= 4 && topRatio <= 0.4) {
            balanceTag = '🌟 五つ星バランス経営';
            diagText = '全教科バランス最高ニャ！この調子ならテストもカフェ経営も大勝利ニャ…でも早く帰って寝たいニャ…';
        } else {
            balanceTag = `🍽️ ${entries.length}品目ラインナップ`;
            diagText = `${entries.length}教科のメニューが揃ってきたニャ！あと1〜2教科増やすとメニュー表が映えるニャ！`;
        }
    }

    const rankEl = document.getElementById('cafe-rank-badge');
    const balEl = document.getElementById('cafe-balance-tag');
    const diagEl = document.getElementById('cafe-diagnosis-text');
    if (rankEl) rankEl.textContent = levelLabel;
    if (balEl) balEl.textContent = balanceTag;
    if (diagEl) diagEl.textContent = `「${diagText}」`;

    // カウンターに並ぶ謎メニュー
    const stageEl = document.getElementById('cafe-counter-stage');
    if (stageEl) {
        if (!entries.length) {
            stageEl.innerHTML = '<div class="session-empty" style="width:100%;">カウンターが空っぽ…勉強すると教科ごとの謎メニューがここに増えるよ！</div>';
        } else {
            stageEl.innerHTML = entries.map(([sid, m]) => {
                const s = getSubjectById(sid);
                const dishes = Math.max(1, Math.ceil(m / 15));
                return `
                    <div class="cafe-dish-chip" style="--dish-color:${escapeHtml(s.color)};">
                        <span>${escapeHtml(s.menuIcon)}</span>
                        <span>${escapeHtml(s.menuName)}</span>
                        <span class="dish-count">×${dishes}皿</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 科目バランス横バー
    const barsEl = document.getElementById('subject-bars-wrap');
    if (barsEl) {
        const maxSubjMin = Math.max(15, ...subjects.map(s => total.bySubject[s.id] || 0));
        barsEl.innerHTML = subjects.map(s => {
            const sm = total.bySubject[s.id] || 0;
            const pct = Math.min(100, (sm / maxSubjMin) * 100);
            return `
                <div class="sbar-row">
                    <span>${escapeHtml(s.icon + ' ' + s.name)}</span>
                    <div class="sbar-track"><div class="sbar-fill" style="width:${pct.toFixed(1)}%; background:${escapeHtml(s.color)};"></div></div>
                    <span class="sbar-val">${sm}分</span>
                </div>
            `;
        }).join('');
    }

    // 直近7日間グラフ
    const weekEl = document.getElementById('week-chart-wrap');
    if (weekEl) {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const ds = getTodayStr(d);
            const mins = state.sessions.filter(s => s.date === ds).reduce((a, s) => a + (Number(s.minutes) || 0), 0);
            days.push({ ds, label: `${d.getMonth() + 1}/${d.getDate()}`, mins, isToday: i === 0 });
        }
        const maxM = Math.max(30, ...days.map(x => x.mins));
        weekEl.innerHTML = days.map(d => {
            const hPct = d.mins > 0 ? Math.max(10, Math.round((d.mins / maxM) * 76)) : 4;
            return `
                <div class="wcol ${d.isToday ? 'today' : ''}">
                    <span class="wcol-min">${d.mins > 0 ? d.mins : ''}</span>
                    <div class="wcol-bar" style="height:${hPct}px;"></div>
                    <span class="wcol-day">${escapeHtml(d.label)}</span>
                </div>
            `;
        }).join('');
    }

    // ガチャ図鑑
    const dexCount = document.getElementById('dex-count-pill');
    const dexGrid = document.getElementById('gacha-dex-grid');
    if (dexCount) dexCount.textContent = `${state.gachaOwned.length} / ${GACHA_ITEMS.length} 収集`;
    if (dexGrid) {
        dexGrid.innerHTML = GACHA_ITEMS.map(item => {
            const owned = state.gachaOwned.includes(item.id);
            const isSsr = item.rarity === 'SSR' || item.rarity === 'SR';
            return `
                <div class="dex-card ${owned ? 'unlocked' : 'locked'} ${isSsr ? 'ssr' : ''}" title="${owned ? escapeHtml(item.note) : '退勤ガチャで解放'}">
                    <span class="dex-emoji">${owned ? escapeHtml(item.emoji) : '❓'}</span>
                    <div class="dex-rarity">${escapeHtml(item.rarity)}</div>
                    <div class="dex-name">${owned ? escapeHtml(item.name) : '？？？'}</div>
                </div>
            `;
        }).join('');
    }

    // テスト後のふりかえり申し送りフォーム同期
    const refMemoEl = document.getElementById('input-reflect-memo');
    if (refMemoEl && document.activeElement !== refMemoEl) {
        refMemoEl.value = state.reflection?.memo || '';
    }
    selectedReflectRating = state.reflection?.rating || '◎ 会心の出来！';
    document.querySelectorAll('#reflect-rating-btns .mood-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.rrate === selectedReflectRating);
    });
}

function buildReceiptHtml(payload) {
    const todaySum = getTodaySummary(payload.date);
    const exam = getActiveExamInfo();
    const examLabel = exam.daysLeft !== null
        ? (exam.daysLeft > 0 ? `${exam.name}（あと${exam.daysLeft}日）` : `${exam.name}（本番期間）`)
        : exam.name;
    const topSubjId = Object.entries(todaySum.bySubject).sort((a, b) => b[1] - a[1])[0]?.[0] || 'penguin';
    const stampChar = getSubjectById(topSubjId);
    const stampSvg = CHAR_SVGS[stampChar.charId] || CHAR_SVGS.penguin;

    let comment = '今日はまだ出勤前だよ…15分だけでもシフト入ってみよう！';
    if (payload.totalMinutes >= 90) {
        comment = `今日${payload.totalMinutes}分も働いたの偉すぎ！もう布団入って14時間爆睡していいよ！`;
    } else if (payload.totalMinutes >= 30) {
        comment = `${payload.totalMinutes}分しっかり積み上げたね！冷蔵庫のプリン食べていいよ！`;
    } else if (payload.totalMinutes > 0) {
        comment = `まず${payload.totalMinutes}分始めただけで優勝！継続が一番強いんだよ〜`;
    }

    const subjRows = Object.entries(todaySum.bySubject).length
        ? Object.entries(todaySum.bySubject).sort((a, b) => b[1] - a[1]).map(([sid, m]) => {
            const s = getSubjectById(sid);
            return `<div class="rcpt-row"><span>${escapeHtml(s.icon + ' ' + s.name)}</span><strong>${m} 分</strong></div>`;
        }).join('')
        : '<div class="rcpt-row"><span>本日の学習記録なし</span><strong>0 分</strong></div>';

    const memoItems = todaySum.list.length
        ? todaySum.list.map(s => {
            const subj = getSubjectById(s.subjectId);
            return `<li><strong>${escapeHtml(subj.name)}</strong>(${s.minutes}分${s.isManual ? '/事後' : ''}): ${escapeHtml(s.memo)}</li>`;
        }).join('')
        : '<li>まだ業務日報はありません</li>';

    return `
        <div class="receipt-paper">
            <div class="rcpt-head">
                <div class="rcpt-store">🏪 テスト前夜の虚無バイト 退勤票</div>
                <div class="rcpt-sub">${escapeHtml(CFG.schoolName)} ｜ ${escapeHtml(examLabel)}</div>
            </div>

            <div class="rcpt-row"><span>日付</span><strong>${escapeHtml(payload.date)}</strong></div>
            <div class="rcpt-row"><span>クラス / 二つ名</span><strong>${escapeHtml(payload.className)}｜${escapeHtml(payload.nickname)}</strong></div>
            <div class="rcpt-row"><span>連続出勤</span><strong>🔥 ${payload.streakDays} 日連続</strong></div>

            <div class="rcpt-total-box">
                <div class="rcpt-total-min">本日合計 ${payload.totalMinutes} 分</div>
                <div class="rcpt-total-sub">ランキング有効 ${payload.effectivePoints} pt ${payload.earlySleepBonus > 0 ? '（早寝+10pt込）' : ''}</div>
            </div>

            <div style="font-size:0.75rem; font-weight:800; margin-bottom:2px;">【教科別シフト内訳】</div>
            ${subjRows}

            <hr class="rcpt-divider">
            <div style="font-size:0.75rem; font-weight:800;">【本日の業務日報】</div>
            <ul class="rcpt-memo-list">${memoItems}</ul>

            <div class="rcpt-stamp-row">
                <div class="rcpt-stamp-svg">${stampSvg}</div>
                <div class="rcpt-stamp-msg">
                    <div><strong>${escapeHtml(stampChar.charName)}の退勤印：</strong></div>
                    <div>「${escapeHtml(comment)}」</div>
                </div>
            </div>

            <div class="rcpt-barcode">
                <div style="font-size:0.68rem; color:#57534E;">SCHOOL VERIFICATION CODE (TAMPER-DETECT)</div>
                <div class="rcpt-barcode-bars"></div>
                <div class="rcpt-code">${escapeHtml(payload.verifyCode)}</div>
            </div>
        </div>
    `;
}

function renderTaikinTab() {
    const payload = buildSubmissionPayload();
    const paperWrap = document.getElementById('receipt-paper');
    if (paperWrap) {
        paperWrap.outerHTML = buildReceiptHtml(payload).replace('class="receipt-paper"', 'class="receipt-paper" id="receipt-paper"');
    }

    const codeEl = document.getElementById('taikin-code-preview');
    if (codeEl) codeEl.textContent = payload.verifyCode;

    const noteEl = document.getElementById('form-status-note');
    if (noteEl) {
        noteEl.textContent = (CFG.googleForm.enabled && CFG.googleForm.prefillBaseUrl)
            ? '✅ 学校専用Googleフォーム連携済み（押すと自動入力フォームが開きます）'
            : '💡 デモモード中：押すと自動入力プレビューが開きます（先生設定で学校フォーム連携可）';
    }

    // 退勤ガチャ解放判定（15分以上、ただし初コレクション0個の間は1分から体験OK）
    const today = getTodayStr();
    const alreadySpun = state.gachaSpunDates.includes(today);
    const minReq = state.gachaOwned.length === 0 ? 1 : CFG.rules.gachaUnlockMinutes;
    const canSpin = !alreadySpun && payload.totalMinutes >= minReq;

    const statusPill = document.getElementById('gacha-status-pill');
    const hintEl = document.getElementById('gacha-unlock-hint');
    const spinBtn = document.getElementById('btn-spin-gacha');

    if (statusPill) {
        statusPill.className = 'gacha-status-pill' + (canSpin ? ' ready' : '');
        statusPill.textContent = alreadySpun ? '本日済み' : (canSpin ? '✨ 回せるよ！' : `あと${Math.max(0, minReq - payload.totalMinutes)}分`);
    }
    if (hintEl) {
        if (alreadySpun) {
            hintEl.textContent = '今日の退勤ガチャは回収済み！また明日シフトに入って回そう！';
        } else if (canSpin) {
            hintEl.textContent = 'お疲れさま！今日の退勤ご褒美カプセルを1回まわせるよ！';
        } else {
            hintEl.textContent = `当日${minReq}分以上勉強すると退勤ガチャが解放されます！`;
        }
    }
    if (spinBtn) {
        spinBtn.disabled = !canSpin;
    }
}

function spinDailyGacha() {
    const today = getTodayStr();
    if (state.gachaSpunDates.includes(today)) return;
    sound.playFanfare();

    // レア度抽選（N:52%, R:30%, SR:13%, SSR:5%）
    const r = Math.random();
    let targetRarity = 'N';
    if (r > 0.95) targetRarity = 'SSR';
    else if (r > 0.82) targetRarity = 'SR';
    else if (r > 0.52) targetRarity = 'R';

    const pool = GACHA_ITEMS.filter(x => x.rarity === targetRarity);
    // 未所持を少し優先してワクワク感UP
    const unowned = pool.filter(x => !state.gachaOwned.includes(x.id));
    const pickFrom = (unowned.length && Math.random() < 0.7) ? unowned : pool;
    const item = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    const isNew = !state.gachaOwned.includes(item.id);

    if (isNew) state.gachaOwned.push(item.id);
    state.gachaSpunDates.push(today);
    saveState();

    const slot = document.getElementById('gacha-result-slot');
    if (slot) {
        slot.innerHTML = `
            <div class="gacha-reveal">
                <div style="font-size:2.4rem;">${escapeHtml(item.emoji)}</div>
                <div style="font-family:var(--font-mono); font-size:0.8rem; color:var(--yellow); font-weight:900;">
                    [${escapeHtml(item.rarity)}] ${isNew ? '✨ NEW GET!!' : 'すでに所持（カフェのストック+1）'}
                </div>
                <div style="font-size:1.05rem; font-weight:900; margin:4px 0;">${escapeHtml(item.name)}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(item.note)}</div>
            </div>
        `;
    }
    renderCafeTab();
    renderTaikinTab();
}

/* ============================================================================
   11. 校内ランキング＆レイドボス（公開CSV読込 or リアルデモ合成）
   ============================================================================ */
const DEMO_SCHOOL_ROWS = [
    { className: '2-3', nickname: '定時退社のチルペンギン', totalPt: 460, todayPt: 95, yesterdayPt: 35, streak: 6, morningMin: 85 },
    { className: '2-1', nickname: '時給1100円のボクバナナ', totalPt: 425, todayPt: 70, yesterdayPt: 60, streak: 5, morningMin: 40 },
    { className: '1-2', nickname: 'こたつ在住の拒否柴',     totalPt: 390, todayPt: 110, yesterdayPt: 20, streak: 4, morningMin: 105 },
    { className: '3-4', nickname: '早寝ガチ勢のたこ焼き',   totalPt: 510, todayPt: 80, yesterdayPt: 75, streak: 7, morningMin: 120 },
    { className: '2-3', nickname: '2進数の塩おにぎり',      totalPt: 340, todayPt: 65, yesterdayPt: 15, streak: 5, morningMin: 30 },
    { className: '1-1', nickname: '皮むけちくわパフェ',     totalPt: 295, todayPt: 85, yesterdayPt: 10, streak: 3, morningMin: 55 },
    { className: '3-1', nickname: '丸メガネのネコビッツ',   totalPt: 480, todayPt: 60, yesterdayPt: 65, streak: 7, morningMin: 70 },
    { className: '2-2', nickname: 'プリン待機のハムスター', totalPt: 260, todayPt: 50, yesterdayPt: 25, streak: 4, morningMin: 20 }
];

function getRankingDataset() {
    const myTotal = getTotalSummary();
    const myToday = getTodaySummary();
    const myStreak = getStreakDays();
    const myRow = {
        className: state.profile.className || '1-1',
        nickname: state.profile.nickname || 'あなた',
        totalPt: myTotal.totalPt + myToday.earlySleepBonus,
        todayPt: myToday.effectivePt,
        yesterdayPt: 0,
        streak: myStreak,
        morningMin: myToday.morningMin,
        isMe: true
    };

    if (liveRankingRows && liveRankingRows.length > 0) {
        return { isLive: true, rows: liveRankingRows };
    }
    const merged = DEMO_SCHOOL_ROWS.map(r => ({ ...r, isMe: false }));
    merged.push(myRow);
    return { isLive: false, rows: merged };
}

function renderRankingTab() {
    const { isLive, rows } = getRankingDataset();
    const myTotal = getTotalSummary();
    const myToday = getTodaySummary();
    const myStreak = getStreakDays();
    const myDamage = myTotal.totalPt + myToday.earlySleepBonus;
    const hasCsv = Boolean(CFG.rankingBoard.publicCsvUrl);
    const showDemo = Boolean(CFG.rankingBoard.showDemoWhenUnlinked);
    const classroomMode = !isLive && !showDemo;

    // 公開ボード外部リンク & 最新読込ボタン制御
    const boardLink = document.getElementById('btn-open-public-board');
    if (boardLink) {
        if (CFG.rankingBoard.publicBoardUrl) {
            boardLink.href = CFG.rankingBoard.publicBoardUrl;
            boardLink.style.display = 'inline-flex';
        } else {
            boardLink.style.display = 'none';
        }
    }
    const reloadBtn = document.getElementById('btn-reload-ranking');
    if (reloadBtn) {
        reloadBtn.style.display = hasCsv ? 'inline-flex' : 'none';
    }

    // 全校レイドボス計算
    const schoolTotalDamage = isLive
        ? rows.reduce((a, r) => a + (r.totalPt || 0), 0)
        : (classroomMode ? myDamage : 11580 + rows.reduce((a, r) => a + (r.totalPt || 0), 0));
    const maxHp = CFG.raidBoss.maxHp;
    const remHp = Math.max(0, maxHp - schoolTotalDamage);
    const hpPct = Math.max(0, Math.min(100, (remHp / maxHp) * 100));

    const bossNameEl = document.getElementById('raid-boss-name');
    const hpTextEl = document.getElementById('raid-hp-text');
    const hpBarEl = document.getElementById('raid-hp-bar-inner');
    const contribEl = document.getElementById('raid-my-contrib');
    const srcEl = document.getElementById('raid-source-badge');

    if (bossNameEl) bossNameEl.textContent = remHp === 0 ? `🎉 ${CFG.raidBoss.name} 撃破完了！` : CFG.raidBoss.name;
    if (hpTextEl) {
        hpTextEl.textContent = classroomMode
            ? `あなたの個人与ダメージ: ${myDamage.toLocaleString()} pt（全校HPはClassroom公開表でチェック！）`
            : `残りHP: ${remHp.toLocaleString()} / ${maxHp.toLocaleString()}`;
    }
    if (hpBarEl) hpBarEl.style.width = `${hpPct.toFixed(1)}%`;
    if (contribEl) contribEl.textContent = `あなたの累計与ダメージ：${myDamage.toLocaleString()} pt`;
    if (srcEl) {
        srcEl.textContent = isLive
            ? '📡 学校スプレッドシート同期中'
            : (classroomMode ? '📢 学年・クラスClassroom公開運用中' : '🎭 デモ校内データ＋あなたの記録を表示中');
    }

    // 部門タブ表示切替
    const deptTabsEl = document.getElementById('rank-dept-tabs');
    if (deptTabsEl) {
        deptTabsEl.style.display = classroomMode ? 'none' : '';
    }
    document.querySelectorAll('#rank-dept-tabs .dept-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.dept === currentRankDept);
    });

    const wrap = document.getElementById('ranking-list-wrap');
    if (!wrap) return;

    // Classroom公開運用モード（架空デモ生徒を出さず、自分の戦績＋Classroom案内を表示）
    if (classroomMode) {
        const openBtnHtml = CFG.rankingBoard.publicBoardUrl
            ? `<a href="${escapeHtml(CFG.rankingBoard.publicBoardUrl)}" target="_blank" rel="noopener" class="btn-mini-primary" style="display:inline-flex; margin-top:10px; text-decoration:none;">📊 公開用・二つ名ランキング表を開く</a>`
            : '';
        wrap.innerHTML = `
            <div class="rank-row me top1" style="display:block; padding:14px 16px;">
                <div style="font-size:0.96rem; font-weight:900; margin-bottom:6px;">📢 校内・学年ランキングは Google Classroom で公開中！</div>
                <p class="sub-hint" style="margin:0 0 8px;">
                    「退勤・PDF」タブからGoogleフォームを送信すると、学年・クラスのClassroomに貼られた<strong>「公開用_二つ名ランキング」</strong>へ自動反映されます（公開表に本名は一切出ません）。
                </p>
                ${openBtnHtml}
            </div>
            <div class="rank-row me" style="margin-top:8px;">
                <div class="rank-num">🎖️</div>
                <div>
                    <div class="rank-who">${escapeHtml(state.profile.nickname || 'あなた')} <small style="color:var(--cyan);">（${escapeHtml(state.profile.className || '1-1')}組）</small></div>
                    <div class="rank-sub">本日 ${myToday.effectivePt}pt ／ 連続出勤 🔥${myStreak}日 ／ 朝勉 🌅${myToday.morningMin}分</div>
                </div>
                <div class="rank-score">累計 ${myDamage.toLocaleString()} pt</div>
            </div>
        `;
        return;
    }

    if (currentRankDept === 'classAvg') {
        const map = {};
        rows.forEach(r => {
            if (!map[r.className]) map[r.className] = { cls: r.className, sum: 0, cnt: 0, hasMe: false };
            map[r.className].sum += (r.totalPt || 0);
            map[r.className].cnt += 1;
            if (r.isMe) map[r.className].hasMe = true;
        });
        const ranked = Object.values(map)
            .map(c => ({ ...c, avg: Math.round(c.sum / Math.max(1, c.cnt)) }))
            .sort((a, b) => b.avg - a.avg);

        wrap.innerHTML = ranked.map((c, idx) => `
            <div class="rank-row ${c.hasMe ? 'me' : ''} ${idx === 0 ? 'top1' : ''}">
                <div class="rank-num">${idx === 0 ? '👑' : idx + 1}</div>
                <div>
                    <div class="rank-who">${escapeHtml(c.cls)} 組 ${c.hasMe ? '<small style="color:var(--cyan);">← あなたのクラス</small>' : ''}</div>
                    <div class="rank-sub">参加 ${c.cnt}名 ／ クラス総ダメージ ${c.sum.toLocaleString()} pt</div>
                </div>
                <div class="rank-score">平均 ${c.avg} pt</div>
            </div>
        `).join('');
        return;
    }

    let sorted = [...rows];
    let formatter = r => `${r.totalPt} pt`;
    let subText = r => `${r.className}組｜連続${r.streak}日`;

    if (currentRankDept === 'rising') {
        sorted.sort((a, b) => (b.todayPt - b.yesterdayPt) - (a.todayPt - a.yesterdayPt));
        formatter = r => {
            const diff = r.todayPt - r.yesterdayPt;
            return `${diff >= 0 ? '+' : ''}${diff} pt`;
        };
        subText = r => `${r.className}組｜本日 ${r.todayPt}pt（昨日比アップ！）`;
    } else if (currentRankDept === 'streak') {
        sorted.sort((a, b) => b.streak - a.streak || b.totalPt - a.totalPt);
        formatter = r => `🔥 ${r.streak} 日`;
        subText = r => `${r.className}組｜累計 ${r.totalPt}pt`;
    } else if (currentRankDept === 'morning') {
        sorted.sort((a, b) => b.morningMin - a.morningMin || b.totalPt - a.totalPt);
        formatter = r => `🌅 ${r.morningMin} 分`;
        subText = r => `${r.className}組｜朝5〜8時の早朝手当対象`;
    } else {
        sorted.sort((a, b) => b.totalPt - a.totalPt);
    }

    wrap.innerHTML = sorted.slice(0, 15).map((r, idx) => `
        <div class="rank-row ${r.isMe ? 'me' : ''} ${idx === 0 ? 'top1' : ''}">
            <div class="rank-num">${idx === 0 ? '👑' : idx + 1}</div>
            <div>
                <div class="rank-who">${escapeHtml(r.nickname)} ${r.isMe ? '<small style="color:var(--cyan);">（あなた）</small>' : ''}</div>
                <div class="rank-sub">${escapeHtml(subText(r))}</div>
            </div>
            <div class="rank-score">${escapeHtml(formatter(r))}</div>
        </div>
    `).join('');
}

async function fetchPublicRankingCsv() {
    const url = CFG.rankingBoard.publicCsvUrl;
    if (!url) {
        sound.playClick();
        renderRankingTab();
        return;
    }
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const csv = await res.text();
        const lines = csv.trim().split(/\r?\n/).slice(1);
        const parsed = [];
        lines.forEach(line => {
            const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
            if (cols.length >= 4 && cols[1]) {
                parsed.push({
                    className: cols[0] || '1-1',
                    nickname: cols[1] || '虚無',
                    totalPt: parseInt(cols[2], 10) || 0,
                    todayPt: parseInt(cols[3], 10) || 0,
                    yesterdayPt: parseInt(cols[4], 10) || 0,
                    streak: parseInt(cols[5], 10) || 0,
                    morningMin: parseInt(cols[6], 10) || 0,
                    isMe: cols[1] === state.profile.nickname && cols[0] === state.profile.className
                });
            }
        });
        if (parsed.length) {
            liveRankingRows = parsed;
            sound.playSuccess();
        }
    } catch (e) {
        // 読込失敗時はデモへ優雅にフォールバック
    }
    renderRankingTab();
}

/* ============================================================================
   12. 設定・範囲ToDo・スマホ↔Chromebook 3秒引き継ぎ
   ============================================================================ */
function buildClassOptionsHtml() {
    const groups = {};
    const others = [];
    CFG.classes.forEach(c => {
        const m = String(c).match(/^([1-3])[-年]/);
        if (m) {
            const g = m[1];
            if (!groups[g]) groups[g] = [];
            groups[g].push(c);
        } else {
            others.push(c);
        }
    });
    const keys = Object.keys(groups).sort();
    if (!keys.length) {
        return CFG.classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)} 組</option>`).join('');
    }
    let html = keys.map(g =>
        `<optgroup label="🏫 ${g}学年">` +
        groups[g].map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)} 組</option>`).join('') +
        `</optgroup>`
    ).join('');
    if (others.length) {
        html += `<optgroup label="その他">` +
            others.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)} 組</option>`).join('') +
            `</optgroup>`;
    }
    return html;
}

function renderSettingsTab() {
    const clsSel = document.getElementById('set-class');
    const nickIn = document.getElementById('set-nickname');
    const goalIn = document.getElementById('set-daily-goal');
    const hintEl = document.getElementById('nick-mode-hint');

    if (clsSel) {
        clsSel.innerHTML = buildClassOptionsHtml();
        clsSel.value = state.profile.className;
    }
    if (nickIn) {
        nickIn.value = state.profile.nickname;
        nickIn.readOnly = !CFG.allowFreeNickname;
    }
    if (hintEl) {
        hintEl.textContent = CFG.allowFreeNickname
            ? '🎲 ガチャで自動生成も、✏️ 自由入力もどちらもOK！'
            : '🎲 学校設定により「二つ名ガチャ」から選んでね！（不適切ネーム防止）';
    }
    if (goalIn) goalIn.value = state.profile.dailyGoalMin || 60;

    // 学校フォーム連携ステータス表示
    const linkEl = document.getElementById('school-link-status');
    if (linkEl) {
        const exam = getActiveExamInfo();
        if (CFG.googleForm.enabled && CFG.googleForm.prefillBaseUrl) {
            linkEl.textContent = `✅ 学校フォーム自動接続中（対象テスト：${exam.name}）`;
        } else {
            linkEl.textContent = '🔗 学校フォーム連携：未接続（Classroomの配布リンクを開くと自動接続されます）';
        }
    }

    // ToDo 科目選択肢
    const todoSubj = document.getElementById('todo-subject');
    if (todoSubj) {
        todoSubj.innerHTML = getAllSubjects().map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.icon + ' ' + s.name)}</option>`).join('');
    }
    renderTodoList();
}

function renderTodoList() {
    const wrap = document.getElementById('todo-list');
    if (!wrap) return;
    if (!state.todos.length) {
        wrap.innerHTML = '<div class="session-empty">テスト範囲チェックリストは空だよ</div>';
        return;
    }
    wrap.innerHTML = state.todos.map(t => {
        const s = getSubjectById(t.subjectId);
        return `
            <div class="todo-item ${t.done ? 'done' : ''}">
                <input type="checkbox" data-todo-toggle="${escapeHtml(t.id)}" ${t.done ? 'checked' : ''}>
                <span class="todo-txt">${escapeHtml(s.icon)} ${escapeHtml(t.text)}</span>
                <button type="button" class="todo-del" data-todo-del="${escapeHtml(t.id)}" title="削除">✖</button>
            </div>
        `;
    }).join('');
}

function exportSyncCode() {
    const code = buildSyncCodeString(false);
    const area = document.getElementById('sync-code-area');
    if (area) area.value = code;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).catch(() => {});
    }
    sound.playSuccess();
    const msg = document.getElementById('sync-msg');
    if (msg) msg.textContent = '✅ 引き継ぎコードをコピーしました！別端末に貼り付けて「合体」を押してね！';
}

function encodeUrlSafeBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeUrlSafeBase64(b64) {
    let norm = String(b64 || '').replace(/-/g, '+').replace(/_/g, '/');
    while (norm.length % 4 !== 0) norm += '=';
    const bin = atob(norm);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

function decodeSyncBundle(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed.startsWith('KYOMU_SYNC_')) throw new Error('invalid_prefix');
    const b64 = trimmed.slice('KYOMU_SYNC_'.length);
    const parsed = JSON.parse(decodeUrlSafeBase64(b64));
    if (parsed && parsed.v === 3) {
        const nowTs = Date.now();
        return {
            v: 3,
            p: { className: parsed.c || state.profile.className, nickname: parsed.n || '' },
            g: Array.isArray(parsed.g) ? parsed.g : [],
            s: (Array.isArray(parsed.s) ? parsed.s : []).map((tup, idx) => ({
                id: 'sess_' + String(tup[0] || (nowTs + '_' + idx)),
                shortId: String(tup[0] || ''),
                date: String(tup[1] || getTodayStr()),
                subjectId: String(tup[2] || 'other'),
                minutes: Math.max(1, Number(tup[3]) || 1),
                points: Math.max(1, Number(tup[4]) || Number(tup[3]) || 1),
                bonusKind: 'normal',
                memo: '📷 QRコードから合体',
                mood: 'ok',
                isManual: Boolean(tup[5]),
                ts: nowTs - idx * 1000
            }))
        };
    }
    return parsed;
}

function importSyncCode() {
    const area = document.getElementById('sync-code-area');
    const msg = document.getElementById('sync-msg');
    if (!area) return;
    const raw = area.value.trim();
    if (!raw.startsWith('KYOMU_SYNC_')) {
        sound.playHarisen();
        if (msg) msg.textContent = '❌ 引き継ぎコードの形式が正しくありません';
        return;
    }
    try {
        const data = decodeSyncBundle(raw);

        // セッションをID・末尾ショートID重複排除で賢くマージ（学校＋自宅の記録が合体！）
        const existingIds = new Set(state.sessions.map(x => x.id));
        const existingShortIds = new Set(state.sessions.map(x => String(x.id || '').slice(-10)));
        let addedCount = 0;
        (data.s || []).forEach(sess => {
            if (!sess || !sess.id) return;
            const tail = sess.shortId || String(sess.id).slice(-10);
            if (existingIds.has(sess.id) || (tail && existingShortIds.has(tail))) return;
            const cleanSess = { ...sess };
            delete cleanSess.shortId;
            state.sessions.push(cleanSess);
            existingIds.add(cleanSess.id);
            if (tail) existingShortIds.add(tail);
            addedCount++;
        });
        state.sessions.sort((a, b) => (b.ts || 0) - (a.ts || 0));

        // ガチャ図鑑・カスタム科目・ToDoも和集合マージ
        state.gachaOwned = Array.from(new Set([...state.gachaOwned, ...(data.g || [])]));
        state.gachaSpunDates = Array.from(new Set([...state.gachaSpunDates, ...(data.gd || [])]));
        const subjIds = new Set(getAllSubjects().map(x => x.id));
        (data.c || []).forEach(cs => {
            if (cs && cs.id && !subjIds.has(cs.id)) {
                state.customSubjects.push(cs);
                subjIds.add(cs.id);
            }
        });
        const todoIds = new Set(state.todos.map(x => x.id));
        (data.t || []).forEach(td => {
            if (td && td.id && !todoIds.has(td.id)) {
                state.todos.push(td);
                todoIds.add(td.id);
            }
        });
        if (data.p && data.p.nickname && !state.profile.setupDone) {
            state.profile = { ...state.profile, ...data.p, setupDone: true };
        }
        if (data.wp && typeof data.wp === 'object') {
            PLAN_DAYS.forEach(d => {
                if (Array.isArray(data.wp[d.key]) && data.wp[d.key].length > 0 && (state.weeklyPlan[d.key] || []).length === 0) {
                    state.weeklyPlan[d.key] = data.wp[d.key];
                }
            });
        }

        saveState();
        sound.playFanfare();
        if (msg) msg.textContent = `🎉 合体成功！別端末から新規シフト ${addedCount}件と図鑑データをマージしました！`;
        renderAll();
    } catch (e) {
        sound.playHarisen();
        if (msg) msg.textContent = '❌ コードの読み取りに失敗しました。すべて選択して貼り付けてね。';
    }
}

/* ============================================================================
   13. 超軽量PDF出力（@media print）＆ フォーム提出
   ============================================================================ */
function exportLightPdf() {
    sound.playClick();
    const payload = buildSubmissionPayload();
    const printRoot = document.getElementById('print-receipt-root');
    if (printRoot) {
        printRoot.innerHTML = buildReceiptHtml(payload);
    }
    const toast = document.getElementById('taikin-copy-toast');
    if (toast) toast.textContent = '🖨️ 印刷画面で「PDFに保存」を選ぶと数十KBの超軽量PDFで保存できます！';
    setTimeout(() => {
        window.print();
    }, 80);
}

function submitToGoogleForm() {
    sound.playSuccess();
    const payload = buildSubmissionPayload();
    const today = getTodayStr();
    if (!state.submittedDates.includes(today) && payload.totalMinutes > 0) {
        state.submittedDates.push(today);
        saveState();
        renderHeader();
    }

    const url = buildGoogleFormPrefillUrl(payload);
    if (url) {
        window.open(url, '_blank', 'noopener');
        const toast = document.getElementById('taikin-copy-toast');
        if (toast) toast.textContent = '🚀 自動入力済みのGoogleフォームを開きました！「送信」を押して退勤完了！';
    } else {
        // 未設定時はプレビューモーダルを表示（モモ肉マンが即動作確認できる！）
        const wrap = document.getElementById('form-preview-fields');
        if (wrap) {
            const rows = [
                ['テスト名', payload.examName],
                ['日付', payload.date],
                ['クラス', payload.className],
                ['二つ名（公開用）', payload.nickname],
                ['本日合計時間', `${payload.totalMinutes} 分`],
                ['ランキング有効pt', `${payload.effectivePoints} pt`],
                ['教科別内訳', payload.subjectBreakdown],
                ['業務日報', payload.dailyReports],
                ['連続出勤', `${payload.streakDays} 日`],
                ['改ざん検知コード', payload.verifyCode]
            ];
            wrap.innerHTML = rows.map(([k, v]) => `
                <div class="fp-row"><strong>${escapeHtml(k)}</strong><span>${escapeHtml(v)}</span></div>
            `).join('');
        }
        openModal('modal-form-preview');
    }
}

function copySubmissionCode() {
    const payload = buildSubmissionPayload();
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(payload.verifyCode).catch(() => {});
    }
    sound.playSuccess();
    const toast = document.getElementById('taikin-copy-toast');
    if (toast) toast.textContent = '📋 提出コードをコピーしました！Classroomに貼り付けて提出してね！';
}

/* ============================================================================
   13.5 全マシマシ新機能群（A11y / Toast / 休憩 / WakeLock / 編集削除Undo / QR / JSON控え）
   ============================================================================ */
function showToast(message, options = {}) {
    const bar = document.getElementById('toast-bar');
    if (!bar) return;
    if (toastTimerId) clearTimeout(toastTimerId);
    bar.innerHTML = `<span>${escapeHtml(message)}</span>`;
    if (options.undoLabel && typeof options.onUndo === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toast-undo-btn';
        btn.textContent = options.undoLabel;
        btn.addEventListener('click', () => {
            options.onUndo();
            bar.classList.remove('show');
        });
        bar.appendChild(btn);
    }
    bar.classList.add('show');
    toastTimerId = setTimeout(() => {
        bar.classList.remove('show');
    }, options.duration || 4800);
}

function applyA11ySettings() {
    const a = state.a11y || { theme: 'dark', fontScale: 'normal', cud: false, reducedMotion: false };
    const root = document.documentElement;
    root.dataset.theme = a.theme === 'light' ? 'light' : 'dark';
    root.dataset.fontScale = a.fontScale === 'large' ? 'large' : 'normal';
    root.dataset.cud = a.cud ? 'on' : 'off';
    root.dataset.reducedMotion = a.reducedMotion ? 'on' : 'off';

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', a.theme === 'light' ? '#EEF2F8' : '#120F1D');

    const hdrBtn = document.getElementById('btn-theme-toggle');
    if (hdrBtn) hdrBtn.textContent = a.theme === 'light' ? '🌙' : '☀️';

    const tBtn = document.getElementById('a11y-theme-btn');
    if (tBtn) {
        tBtn.textContent = a.theme === 'light' ? '☀️ 昼モード' : '🌙 夜カフェ';
        tBtn.classList.toggle('on', a.theme === 'light');
    }
    const fBtn = document.getElementById('a11y-font-btn');
    if (fBtn) {
        fBtn.textContent = a.fontScale === 'large' ? '大きめ' : '標準';
        fBtn.classList.toggle('on', a.fontScale === 'large');
    }
    const cBtn = document.getElementById('a11y-cud-btn');
    if (cBtn) {
        cBtn.textContent = a.cud ? 'ON（柄補助）' : 'OFF';
        cBtn.classList.toggle('on', Boolean(a.cud));
    }
    const mBtn = document.getElementById('a11y-motion-btn');
    if (mBtn) {
        mBtn.textContent = a.reducedMotion ? 'ON（静か）' : 'OFF';
        mBtn.classList.toggle('on', Boolean(a.reducedMotion));
    }
}

function renderPrevExamMemoBar() {
    const bar = document.getElementById('prev-exam-memo-bar');
    if (!bar) return;
    const ref = state.reflection;
    if (!ref || !ref.memo || ref.dismissed) {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';
    bar.innerHTML = `
        <span>💌 <strong>自分への申し送り</strong>（${escapeHtml(ref.rating || '')}）：${escapeHtml(ref.memo)}</span>
        <button type="button" class="btn-mini-ghost" id="btn-dismiss-memo">✖ 閉じる</button>
    `;
    document.getElementById('btn-dismiss-memo')?.addEventListener('click', () => {
        state.reflection.dismissed = true;
        saveState();
        bar.style.display = 'none';
    });
}

function checkStorageHealth() {
    const warn = document.getElementById('storage-warn-bar');
    if (!warn) return;
    try {
        const testKey = '__kyomu_ls_test__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        warn.style.display = 'none';
    } catch (e) {
        warn.style.display = 'flex';
        warn.innerHTML = '<span>⚠️ ブラウザの保存領域が制限中（シークレットモード等）です。退勤後は設定タブから控えJSONを保存してね！</span>';
    }
}

// 5分休憩タイマー
function offerBreakTimer() {
    const bar = document.getElementById('break-timer-banner');
    if (!bar) return;
    bar.style.display = 'flex';
    bar.innerHTML = `
        <span>☕ 1セットお疲れさま！ダラダラ防止に<strong>5分だけ休憩タイマー</strong>を使う？</span>
        <div style="display:flex; gap:6px;">
            <button type="button" class="btn-mini-primary" id="btn-start-break-5">☕ 5分休憩スタート</button>
            <button type="button" class="btn-mini-ghost" id="btn-close-break">今はOK</button>
        </div>
    `;
    document.getElementById('btn-start-break-5')?.addEventListener('click', () => startBreakTimer(300));
    document.getElementById('btn-close-break')?.addEventListener('click', stopBreakTimer);
}

function startBreakTimer(seconds = 300) {
    stopBreakTimer();
    sound.playClick();
    breakEndAt = Date.now() + seconds * 1000;
    const renderBreak = () => {
        const bar = document.getElementById('break-timer-banner');
        if (!bar || !breakEndAt) return;
        const remain = Math.max(0, Math.ceil((breakEndAt - Date.now()) / 1000));
        if (remain <= 0) {
            stopBreakTimer();
            sound.playFanfare();
            showToast('⏰ 5分休憩おわり！次のシフト15分だけいこうバナナ！', { duration: 6000 });
            return;
        }
        const mmss = formatMMSS(remain);
        document.title = `☕ ${mmss} 休憩中｜虚無バイト`;
        bar.style.display = 'flex';
        bar.innerHTML = `
            <span>☕ <strong>5分休憩中：残り ${mmss}</strong>（水分補給＆ストレッチしよう〜）</span>
            <button type="button" class="btn-mini-ghost" id="btn-stop-break-now">休憩終了</button>
        `;
        document.getElementById('btn-stop-break-now')?.addEventListener('click', stopBreakTimer);
    };
    renderBreak();
    breakTickId = setInterval(renderBreak, 500);
}

function stopBreakTimer() {
    if (breakTickId) {
        clearInterval(breakTickId);
        breakTickId = null;
    }
    breakEndAt = null;
    const bar = document.getElementById('break-timer-banner');
    if (bar) bar.style.display = 'none';
    if (!state.activeTimer) {
        document.title = 'テスト前夜の虚無バイト 〜StudyKYOMU+〜';
    }
}

// 画面ONキープ（Wake Lock API・非対応端末でも安全動作）
async function toggleWakeLock() {
    const btn = document.getElementById('btn-wakelock');
    sound.playClick();
    if (wakeLockEnabled) {
        wakeLockEnabled = false;
        if (wakeLockSentinel) {
            try { await wakeLockSentinel.release(); } catch (e) {}
            wakeLockSentinel = null;
        }
        if (btn) {
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = '🔆 画面ONキープ: OFF';
        }
        showToast('画面ONキープをOFFにしました');
        return;
    }
    if (!('wakeLock' in navigator)) {
        showToast('このブラウザは画面ONキープ非対応ですが、画面OFFでも裏で正確に計測できます！');
        return;
    }
    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockEnabled = true;
        if (btn) {
            btn.setAttribute('aria-pressed', 'true');
            btn.textContent = '🔆 画面ONキープ: ON';
        }
        showToast('🔆 勉強中は画面が暗くならないようキープします！');
    } catch (e) {
        showToast('省電力設定などのため画面ONキープを有効化できませんでした');
    }
}

// 履歴の編集・削除（5秒Undo付き）
function openEditSessionModal(sessId) {
    const sess = state.sessions.find(s => s.id === sessId);
    if (!sess) return;
    editingSessionId = sessId;
    sound.playClick();
    const sel = document.getElementById('edit-sess-subject');
    const minEl = document.getElementById('edit-sess-minutes');
    const memoEl = document.getElementById('edit-sess-memo');
    if (sel) {
        sel.innerHTML = getAllSubjects().map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.icon + ' ' + s.name)}</option>`).join('');
        sel.value = sess.subjectId;
    }
    if (minEl) minEl.value = String(sess.minutes);
    if (memoEl) memoEl.value = sess.memo || '';
    openModal('modal-edit-session');
}

function saveEditedSession() {
    if (!editingSessionId) return;
    const sess = state.sessions.find(s => s.id === editingSessionId);
    if (!sess) return;
    const subjId = document.getElementById('edit-sess-subject')?.value || sess.subjectId;
    const minutes = Math.max(1, Math.min(CFG.rules.maxSessionMinutes, parseInt(document.getElementById('edit-sess-minutes')?.value, 10) || sess.minutes));
    const memo = (document.getElementById('edit-sess-memo')?.value || '').trim();
    if (memo.length < CFG.rules.minReportLength) {
        sound.playHarisen();
        showToast(`メモは${CFG.rules.minReportLength}文字以上にしてね！`);
        return;
    }
    const mult = sess.bonusKind === 'morning' ? CFG.rules.morningMultiplier : (sess.bonusKind === 'latenight' ? CFG.rules.lateNightMultiplier : 1.0);
    sess.subjectId = subjId;
    sess.minutes = minutes;
    sess.points = Math.max(1, Math.round(minutes * (sess.isManual ? Math.min(1.0, mult) : mult)));
    sess.memo = memo;
    editingSessionId = null;
    saveState();
    sound.playSuccess();
    closeModal('modal-edit-session');
    renderAll();
    showToast('✅ シフト履歴を修正しました！');
}

function deleteSessionWithUndo(sessId) {
    const idx = state.sessions.findIndex(s => s.id === sessId);
    if (idx === -1) return;
    sound.playClick();
    const removed = state.sessions.splice(idx, 1)[0];
    lastDeletedSession = { record: removed, index: idx };
    saveState();
    renderAll();
    showToast('🗑️ 記録を1件削除しました', {
        undoLabel: '↩️ 元に戻す',
        duration: 5500,
        onUndo: () => {
            if (!lastDeletedSession) return;
            state.sessions.splice(Math.min(lastDeletedSession.index, state.sessions.length), 0, lastDeletedSession.record);
            lastDeletedSession = null;
            saveState();
            sound.playSuccess();
            renderAll();
            showToast('↩️ 削除を取り消して復元しました！');
        }
    });
}

// QRコード引き継ぎ＆URL自動合体（v3超コンパクト＋URL-safe Base64でスマホ読取を最速化）
function buildSyncCodeString(compact = false, maxSessions = 8) {
    if (compact) {
        const compactBundle = {
            v: 3,
            c: state.profile.className,
            n: (state.profile.nickname || '').slice(0, 18),
            g: state.gachaOwned.slice(0, 24),
            s: state.sessions.slice(0, maxSessions).map(x => [
                String(x.id || '').slice(-10),
                x.date,
                x.subjectId,
                x.minutes,
                x.points,
                x.isManual ? 1 : 0
            ])
        };
        return 'KYOMU_SYNC_' + encodeUrlSafeBase64(JSON.stringify(compactBundle));
    }
    const fullBundle = {
        v: 2,
        p: state.profile,
        c: state.customSubjects,
        s: state.sessions,
        g: state.gachaOwned,
        gd: state.gachaSpunDates,
        t: state.todos,
        wp: state.weeklyPlan,
        ex: state.examSetting,
        rf: state.reflection
    };
    return 'KYOMU_SYNC_' + encodeUrlSafeBase64(JSON.stringify(fullBundle));
}

function showSyncQrCode() {
    const wrap = document.getElementById('sync-qr-wrap');
    const canvas = document.getElementById('sync-qr-canvas');
    const note = document.getElementById('sync-qr-note');
    if (!wrap || !canvas || !window.QRMini) return;

    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    const baseUrl = location.origin + location.pathname;
    let ok = false;
    let packedSessions = 0;

    // 収まる最大セッション数を自動選択（GitHub Pagesの日本語長URLでも100%描画）
    const trialCounts = [8, 5, 3, 2, 1, 0];
    for (const cnt of trialCounts) {
        const code = buildSyncCodeString(true, cnt);
        const qrPayload = isHttp ? `${baseUrl}?sync=${code}` : code;
        if (window.QRMini.drawToCanvas(canvas, qrPayload, 240)) {
            ok = true;
            packedSessions = Math.min(cnt, state.sessions.length);
            break;
        }
    }

    wrap.style.display = 'flex';
    if (ok) {
        sound.playSuccess();
        if (note) {
            const detail = packedSessions > 0
                ? `（最新シフト${packedSessions}件＋図鑑を収録）`
                : '（プロフィール＋図鑑を収録）';
            note.textContent = isHttp
                ? `📷 スマホのカメラで読み取るとURLが開いて1タップで合体できます！${detail}`
                : `📷 ローカル起動中：GitHub Pages 公開時はカメラ読取でそのまま合体リンクが開きます！${detail}`;
        }
    } else if (note) {
        note.textContent = 'データ量が多いため、下の「テキストコードをコピー」を使って引き継いでね！';
    }
}

function checkIncomingQrSync() {
    try {
        const sp = new URLSearchParams(window.location.search);
        const code = (sp.get('sync') || '').trim();
        if (!code.startsWith('KYOMU_SYNC_')) return;
        pendingQrSyncCode = code;
        let summaryText = '📷 別端末の最新シフト記録＆ガチャ図鑑を合体する準備ができました！';
        try {
            const preview = decodeSyncBundle(code);
            const sCnt = (preview.s || []).length;
            const gCnt = (preview.g || []).length;
            const who = preview.p?.nickname ? `「${preview.p.nickname}」の` : '別端末の';
            summaryText = `📷 ${who}最新シフト ${sCnt}件 ＆ ガチャ図鑑 ${gCnt}種 を合体する準備ができました！`;
        } catch (e) {}
        const sumEl = document.getElementById('qr-import-summary');
        if (sumEl) sumEl.textContent = summaryText;
        openModal('modal-qr-import');
        // URLの?sync=パラメータを綺麗に掃除
        sp.delete('sync');
        const nextUrl = location.pathname + (sp.toString() ? '?' + sp.toString() : '');
        if (history.replaceState) history.replaceState(null, '', nextUrl);
    } catch (e) {}
}

// JSON控えバックアップ保存＆復元
function downloadBackupJson() {
    sound.playSuccess();
    const json = JSON.stringify({ exportedAt: new Date().toISOString(), app: 'StudyKYOMU+', state }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kyomu_backup_${getTodayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('💾 控えバックアップファイル(.json)を保存しました！');
}

function restoreBackupJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(String(reader.result || ''));
            const incoming = parsed.state || parsed;
            if (!incoming || !incoming.profile) throw new Error('invalid');
            localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));
            state = loadState();
            applyA11ySettings();
            renderAll();
            sound.playFanfare();
            showToast('🎉 JSONバックアップから完全復元しました！');
        } catch (e) {
            sound.playHarisen();
            showToast('❌ JSONファイルの形式が正しくありません');
        }
    };
    reader.readAsText(file);
}

/* ============================================================================
   14. タブ切替・モーダル・イベント配線
   ============================================================================ */
function switchTab(tabName) {
    sound.playClick();
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
    document.querySelectorAll('.nav-tab, .bnav-item').forEach(b => {
        const isAct = b.dataset.tab === tabName;
        b.classList.toggle('active', isAct);
        if (b.getAttribute('role') === 'tab') b.setAttribute('aria-selected', String(isAct));
    });
    if (tabName === 'plan') renderPlanTab();
    if (tabName === 'cafe') renderCafeTab();
    if (tabName === 'taikin') renderTaikinTab();
    if (tabName === 'ranking') renderRankingTab();
    if (tabName === 'settings') renderSettingsTab();
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}

function renderAll() {
    renderHeader();
    renderShiftTab();
    renderPlanTab();
    renderCafeTab();
    renderTaikinTab();
    renderRankingTab();
    renderSettingsTab();
}

function initOnboarding() {
    const obCls = document.getElementById('ob-class');
    const obNick = document.getElementById('ob-nickname');
    const obHint = document.getElementById('ob-nick-hint');
    if (obCls) {
        obCls.innerHTML = buildClassOptionsHtml();
        obCls.value = state.profile.className;
    }
    if (obNick) {
        obNick.value = state.profile.nickname;
        obNick.readOnly = !CFG.allowFreeNickname;
    }
    if (obHint && !CFG.allowFreeNickname) {
        obHint.textContent = '🎲 ガチャボタンを押して好きな二つ名が出るまで回してね！';
    }
    if (!state.profile.setupDone) {
        openModal('modal-onboarding');
    }
}

function checkNewSchoolYearPrompt() {
    // すでに利用済みの生徒が「新年度(yr)」の配布URLを開いたとき、旧クラスのまま提出するミスを防ぐため自動でポップアップ
    if (!state.profile.setupDone) return;
    const targetYear = String(CFG.schoolYear || '').trim();
    if (!targetYear) return;
    const savedYear = String(state.profile.schoolYear || '').trim();
    if (savedYear === targetYear) return;

    const titleEl = document.getElementById('ny-modal-title');
    const infoEl = document.getElementById('ny-prev-info');
    const clsSel = document.getElementById('ny-class');
    const nickIn = document.getElementById('ny-nickname');

    if (titleEl) titleEl.textContent = `🌸 ${targetYear}年度おめでとう！新しいクラスを確認しよう`;
    if (infoEl) {
        const prevTxt = savedYear ? `${savedYear}年度のクラス` : 'これまでのクラス';
        infoEl.textContent = `「新年度おめでとうペン！${prevTxt}（${state.profile.className}組）から進級・クラス替えがあったら、下のリストで新しいクラスを選んでスタートするペン！」`;
    }
    if (clsSel) {
        clsSel.innerHTML = buildClassOptionsHtml();
        // 進級先クラス候補を親切に仮選択（例: 1-3 → 2-3、2-5 → 3-5）
        let suggested = state.profile.className;
        const m = String(state.profile.className || '').match(/^([12])-(.+)$/);
        if (m) {
            const nextCls = `${Number(m[1]) + 1}-${m[2]}`;
            if (CFG.classes.includes(nextCls)) suggested = nextCls;
        }
        clsSel.value = suggested;
    }
    if (nickIn) {
        nickIn.value = state.profile.nickname;
        nickIn.readOnly = !CFG.allowFreeNickname;
    }
    openModal('modal-new-year-class');
}

function bindEvents() {
    // タブ切替（PC上部＆スマホ下部）
    document.querySelectorAll('.nav-tab, .bnav-item').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // ヘッダー操作
    const btnAudio = document.getElementById('btn-audio');
    if (btnAudio) {
        btnAudio.addEventListener('click', () => {
            sound.isMuted = !sound.isMuted;
            btnAudio.textContent = sound.isMuted ? '🔇' : '🔊';
            if (!sound.isMuted) {
                sound.initCtx();
                sound.playClick();
                showToast('🔊 効果音をONにしました');
            } else {
                if (ambient.getActiveTracks().length > 0) {
                    ambient.stopAll();
                    syncAmbientUI();
                }
                showToast('🔇 効果音・環境音をミュートしました');
            }
        });
    }
    const switchHelpTab = (tabId) => {
        document.querySelectorAll('#help-tabs .help-tab-btn').forEach(b => {
            const act = b.dataset.helpTab === tabId;
            b.classList.toggle('active', act);
            b.setAttribute('aria-selected', String(act));
        });
        document.querySelectorAll('#modal-help .help-panel').forEach(p => {
            const act = p.id === `help-panel-${tabId}`;
            p.classList.toggle('active', act);
            p.hidden = !act;
        });
    };
    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) {
        btnHelp.addEventListener('click', () => {
            sound.playClick();
            switchHelpTab('basic');
            openModal('modal-help');
        });
    }
    const helpTabBar = document.getElementById('help-tabs');
    if (helpTabBar) {
        helpTabBar.addEventListener('click', e => {
            const btn = e.target.closest('.help-tab-btn');
            if (!btn) return;
            sound.playClick();
            switchHelpTab(btn.dataset.helpTab);
        });
        helpTabBar.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const btns = Array.from(helpTabBar.querySelectorAll('.help-tab-btn'));
            const idx = btns.indexOf(document.activeElement);
            if (idx === -1) return;
            e.preventDefault();
            const next = btns[(idx + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
            next.focus();
            sound.playClick();
            switchHelpTab(next.dataset.helpTab);
        });
    }
    const btnProf = document.getElementById('btn-open-profile');
    if (btnProf) btnProf.addEventListener('click', () => switchTab('settings'));

    // 今回のテスト名・試験日設定モーダル
    const openExamSettingModal = () => {
        sound.playClick();
        const exam = getActiveExamInfo();
        const nameEl = document.getElementById('input-exam-name');
        const dateEl = document.getElementById('input-exam-date');
        if (nameEl) nameEl.value = exam.name;
        if (dateEl) dateEl.value = exam.dateStr || '';
        openModal('modal-exam-setting');
    };
    document.getElementById('header-exam-pill')?.addEventListener('click', openExamSettingModal);
    document.getElementById('btn-open-exam-from-settings')?.addEventListener('click', openExamSettingModal);
    document.querySelectorAll('#exam-preset-chips [data-exam-preset]').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            const nameEl = document.getElementById('input-exam-name');
            if (nameEl) nameEl.value = btn.dataset.examPreset;
        });
    });
    document.getElementById('btn-clear-exam-date')?.addEventListener('click', () => {
        sound.playClick();
        const dateEl = document.getElementById('input-exam-date');
        if (dateEl) dateEl.value = '';
    });
    document.getElementById('btn-save-exam-setting')?.addEventListener('click', () => {
        const name = (document.getElementById('input-exam-name')?.value || '').trim() || '定期考査';
        const date = (document.getElementById('input-exam-date')?.value || '').trim();
        state.examSetting = { name: name.slice(0, 20), date };
        saveState();
        sound.playSuccess();
        closeModal('modal-exam-setting');
        renderAll();
    });

    // モーダル閉じる
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            closeModal(btn.dataset.closeModal);
        });
    });

    // オンボーディング
    const btnObRoll = document.getElementById('btn-roll-nick-ob');
    if (btnObRoll) {
        btnObRoll.addEventListener('click', () => {
            sound.playLightOn();
            const el = document.getElementById('ob-nickname');
            if (el) el.value = rollRandomNickname();
        });
    }
    const btnObDone = document.getElementById('btn-ob-done');
    if (btnObDone) {
        btnObDone.addEventListener('click', () => {
            const cls = document.getElementById('ob-class')?.value || CFG.classes[0];
            const nick = (document.getElementById('ob-nickname')?.value || '').trim() || rollRandomNickname();
            state.profile.className = cls;
            state.profile.nickname = nick.slice(0, 18);
            state.profile.schoolYear = CFG.schoolYear || getFiscalYearStr();
            state.profile.setupDone = true;
            saveState();
            sound.playSuccess();
            closeModal('modal-onboarding');
            renderAll();
        });
    }

    // 🌸 新年度・進級クラス変更モーダル
    document.getElementById('btn-roll-nick-ny')?.addEventListener('click', () => {
        sound.playLightOn();
        const el = document.getElementById('ny-nickname');
        if (el) el.value = rollRandomNickname();
    });
    document.getElementById('btn-ny-done')?.addEventListener('click', () => {
        const cls = document.getElementById('ny-class')?.value || state.profile.className;
        const nick = (document.getElementById('ny-nickname')?.value || '').trim() || state.profile.nickname || rollRandomNickname();
        state.profile.className = cls;
        state.profile.nickname = nick.slice(0, 18);
        state.profile.schoolYear = CFG.schoolYear || getFiscalYearStr();
        state.profile.setupDone = true;
        saveState();
        sound.playFanfare();
        closeModal('modal-new-year-class');
        renderAll();
        showToast(`🌸 ${state.profile.schoolYear}年度「${cls}組」へクラスを更新しました！`);
    });

    // タイマーモード切替
    document.querySelectorAll('#timer-mode-pills .mode-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.activeTimer) return;
            sound.playClick();
            state.timerMode = btn.dataset.mode;
            saveState();
            renderShiftTab();
        });
    });

    // タイマーボタン
    document.getElementById('btn-timer-start')?.addEventListener('click', startShiftTimer);
    document.getElementById('btn-timer-finish')?.addEventListener('click', () => finishShiftTimer(false));
    document.getElementById('btn-timer-cancel')?.addEventListener('click', cancelShiftTimer);

    // 学習ブースト環境音ミキサー（プリセット・個別11トラック重ねがけ・全画面クロック双方向同期）
    const handlePresetClick = (presetId) => {
        ambient.applyPreset(presetId);
        if (presetId !== 'off') {
            saveAmbientPref();
            const label = AMBIENT_PRESETS[presetId]?.label || 'カスタムMIX';
            showToast(`🎧 環境音ON：${label}`);
        } else {
            showToast('🔇 環境音をOFFにしました');
        }
        syncAmbientUI();
    };

    document.querySelectorAll('#ambient-presets .amb-btn, #focus-ambient-presets .amb-btn').forEach(btn => {
        btn.addEventListener('click', () => handlePresetClick(btn.dataset.preset));
    });

    const handleMasterVolInput = (valNum) => {
        const pct = Math.max(0, Math.min(100, Number(valNum) || 0));
        ambient.setMasterVolume(pct / 100);
        if (!state.ambientPref) state.ambientPref = { masterVol: pct, autoWithTimer: false, lastPreset: 'night_rain_cafe', lastMix: AMBIENT_PRESETS.night_rain_cafe.mix };
        state.ambientPref.masterVol = pct;
        saveState();
        syncAmbientUI();
    };
    document.getElementById('ambient-vol')?.addEventListener('input', e => handleMasterVolInput(e.target.value));
    document.getElementById('focus-ambient-vol')?.addEventListener('input', e => handleMasterVolInput(e.target.value));

    const autoChk = document.getElementById('chk-ambient-auto');
    if (autoChk) {
        autoChk.addEventListener('change', () => {
            if (!state.ambientPref) state.ambientPref = { masterVol: 55, autoWithTimer: false, lastPreset: 'night_rain_cafe', lastMix: AMBIENT_PRESETS.night_rain_cafe.mix };
            state.ambientPref.autoWithTimer = autoChk.checked;
            saveState();
            sound.playClick();
            showToast(autoChk.checked
                ? '⏱️ シフト開始で前回の環境音を自動再生します！'
                : '⏱️ 環境音のタイマー連動をOFFにしました');
        });
    }

    const drawerBtn = document.getElementById('btn-toggle-mixer');
    const drawerEl = document.getElementById('ambient-mixer-drawer');
    if (drawerBtn && drawerEl) {
        drawerBtn.addEventListener('click', () => {
            sound.playClick();
            const isOpen = drawerEl.hidden;
            drawerEl.hidden = !isOpen;
            drawerBtn.classList.toggle('open', isOpen);
            drawerBtn.setAttribute('aria-expanded', String(isOpen));
            drawerBtn.textContent = isOpen ? '🎚️ ミキサーを閉じる' : '🎚️ 全11種ミキサー';
        });
    }

    const trackGrid = document.getElementById('mixer-track-grid');
    if (trackGrid) {
        trackGrid.addEventListener('click', e => {
            const toggleBtn = e.target.closest('[data-amb-toggle]');
            if (!toggleBtn) return;
            const tid = toggleBtn.dataset.ambToggle;
            const isOn = ambient.toggleTrack(tid);
            if (isOn) saveAmbientPref();
            syncAmbientUI();
        });
        trackGrid.addEventListener('input', e => {
            const slider = e.target.closest('[data-amb-vol]');
            if (!slider) return;
            const tid = slider.dataset.ambVol;
            const pct = Math.max(5, Math.min(100, Number(slider.value) || 50));
            ambient.setTrackVolume(tid, pct / 100);
            const pctEl = trackGrid.querySelector(`[data-amb-pct="${tid}"]`);
            if (pctEl) pctEl.textContent = `${pct}%`;
            if (ambient.tracks.get(tid)?.active) saveAmbientPref();
        });
    }

    // 科目選択（イベント委譲）
    document.getElementById('subject-grid')?.addEventListener('click', e => {
        const btn = e.target.closest('.subject-btn');
        if (!btn || state.activeTimer) return;
        sound.playClick();
        state.selectedSubjectId = btn.dataset.subj;
        saveState();
        renderShiftTab();
    });

    // ミニ目標チップ
    document.querySelectorAll('#goal-chips .goal-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            const inp = document.getElementById('input-mini-goal');
            if (inp) inp.value = btn.dataset.goal;
        });
    });

    // 科目追加
    document.getElementById('btn-add-subject')?.addEventListener('click', () => {
        sound.playClick();
        openModal('modal-add-subject');
    });
    document.getElementById('btn-save-new-subject')?.addEventListener('click', () => {
        const name = (document.getElementById('new-subj-name')?.value || '').trim();
        const icon = document.getElementById('new-subj-icon')?.value || '📘';
        if (!name) return;
        const palette = ['#22D3EE', '#FF4DA6', '#FACC15', '#34D399', '#A855F7', '#FB923C'];
        const chars = ['penguin', 'banana', 'shiba', 'hammy', 'takoyaki', 'cat', 'chikuwa'];
        const idx = state.customSubjects.length;
        const newSubj = {
            id: 'custom_' + Date.now(),
            name: name.slice(0, 14),
            icon,
            color: palette[idx % palette.length],
            charId: chars[idx % chars.length],
            charName: '助っ人バイト',
            menuName: `${name.slice(0, 6)}スペシャル`,
            menuIcon: '🍽️',
            mutters: [`${name}も15分やれば意外と進むよ…たぶんね…`]
        };
        state.customSubjects.push(newSubj);
        state.selectedSubjectId = newSubj.id;
        saveState();
        sound.playSuccess();
        const nameEl = document.getElementById('new-subj-name');
        if (nameEl) nameEl.value = '';
        closeModal('modal-add-subject');
        renderAll();
    });

    // 業務日報モーダル
    document.getElementById('input-report-memo')?.addEventListener('input', updateReportCounter);
    document.querySelectorAll('#report-mood-btns .mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            selectedMood = btn.dataset.mood;
            document.querySelectorAll('#report-mood-btns .mood-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
    });
    document.getElementById('btn-submit-report')?.addEventListener('click', submitReportModal);

    // 紙ノート事後申請
    document.getElementById('btn-open-manual')?.addEventListener('click', openManualModal);
    document.getElementById('btn-submit-manual')?.addEventListener('click', submitManualRecord);

    // 1週間計画タブ操作
    document.getElementById('plan-day-tabs')?.addEventListener('click', e => {
        const btn = e.target.closest('.day-tab-btn');
        if (!btn) return;
        sound.playClick();
        selectedPlanDay = btn.dataset.pday;
        renderPlanTab();
    });
    document.getElementById('week-overview-grid')?.addEventListener('click', e => {
        const row = e.target.closest('.wov-row');
        if (!row) return;
        sound.playClick();
        selectedPlanDay = row.dataset.ovday;
        renderPlanTab();
    });

    const sStartEl = document.getElementById('slider-start');
    const sEndEl = document.getElementById('slider-end');
    if (sStartEl) {
        sStartEl.addEventListener('input', () => {
            const v = parseInt(sStartEl.value, 10);
            planSliderStart = Math.min(v, planSliderEnd - 15);
            updateDualSliderUI();
        });
    }
    if (sEndEl) {
        sEndEl.addEventListener('input', () => {
            const v = parseInt(sEndEl.value, 10);
            planSliderEnd = Math.max(v, planSliderStart + 15);
            updateDualSliderUI();
        });
    }
    document.querySelectorAll('.nudge-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            const [target, deltaStr] = (btn.dataset.nudge || '').split(':');
            const delta = parseInt(deltaStr, 10) || 0;
            if (target === 'start') {
                planSliderStart = Math.max(PLAN_MIN, Math.min(planSliderEnd - 15, planSliderStart + delta));
            } else {
                planSliderEnd = Math.min(PLAN_MAX, Math.max(planSliderStart + 15, planSliderEnd + delta));
            }
            updateDualSliderUI();
        });
    });

    const handlePaletteClick = e => {
        const chip = e.target.closest('.pal-chip');
        if (!chip) return;
        sound.playClick();
        selectedPlanPalette = { kind: chip.dataset.pkind, itemId: chip.dataset.pid };
        renderPlanTab();
    };
    document.getElementById('plan-study-palette')?.addEventListener('click', handlePaletteClick);
    document.getElementById('plan-life-palette')?.addEventListener('click', handlePaletteClick);

    document.getElementById('btn-plan-place')?.addEventListener('click', () => {
        sound.playSuccess();
        upsertPlanBlock(selectedPlanDay, {
            startMin: planSliderStart,
            endMin: planSliderEnd,
            kind: selectedPlanPalette.kind,
            itemId: selectedPlanPalette.itemId
        });
        // 連続配置アシスト：次の開始時刻を直後の終了時刻へ自動スライド！
        const nextStart = Math.min(PLAN_MAX - 15, planSliderEnd);
        const nextEnd = Math.min(PLAN_MAX, nextStart + 45);
        planSliderStart = nextStart;
        planSliderEnd = Math.max(nextStart + 15, nextEnd);
        renderPlanTab();
        renderTodayPlanStrip();
    });

    document.getElementById('plan-block-list')?.addEventListener('click', e => {
        const delId = e.target.dataset?.delBlkid;
        const startId = e.target.dataset?.startBlkid;
        const loadEl = e.target.closest('[data-load-blkid]');
        if (delId) {
            sound.playClick();
            state.weeklyPlan[selectedPlanDay] = (state.weeklyPlan[selectedPlanDay] || []).filter(b => b.id !== delId);
            saveState();
            renderPlanTab();
            renderTodayPlanStrip();
        } else if (startId) {
            const blk = (state.weeklyPlan[selectedPlanDay] || []).find(b => b.id === startId);
            if (blk && blk.kind === 'study') {
                state.selectedSubjectId = blk.itemId;
                const d = blk.endMin - blk.startMin;
                state.timerMode = d <= 20 ? 'pomo15' : (d >= 45 ? 'pomo50' : 'pomo25');
                saveState();
                switchTab('shift');
                renderShiftTab();
            }
        } else if (loadEl) {
            const blk = (state.weeklyPlan[selectedPlanDay] || []).find(b => b.id === loadEl.dataset.loadBlkid);
            if (blk) {
                sound.playClick();
                planSliderStart = blk.startMin;
                planSliderEnd = blk.endMin;
                selectedPlanPalette = { kind: blk.kind, itemId: blk.itemId };
                renderPlanTab();
            }
        }
    });

    document.getElementById('btn-plan-template')?.addEventListener('click', applyWeeklyPlanTemplate);
    document.getElementById('btn-plan-pdf')?.addEventListener('click', exportWeeklyPlanPdf);
    document.getElementById('btn-plan-copy-weekdays')?.addEventListener('click', () => {
        sound.playSuccess();
        const src = state.weeklyPlan[selectedPlanDay] || [];
        ['mon', 'tue', 'wed', 'thu', 'fri'].forEach(dk => {
            if (dk === selectedPlanDay) return;
            state.weeklyPlan[dk] = src.map((b, i) => ({ ...b, id: `cp_${dk}_${Date.now()}_${i}` }));
        });
        saveState();
        renderPlanTab();
        renderTodayPlanStrip();
    });
    document.getElementById('btn-plan-clear-day')?.addEventListener('click', () => {
        if (!confirm('この曜日の計画をすべてクリアしますか？')) return;
        sound.playClick();
        state.weeklyPlan[selectedPlanDay] = [];
        saveState();
        renderPlanTab();
        renderTodayPlanStrip();
    });
    setupPlanResizeDrag();

    // 退勤タブ操作
    document.getElementById('btn-submit-form')?.addEventListener('click', submitToGoogleForm);
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportLightPdf);
    document.getElementById('btn-copy-code')?.addEventListener('click', copySubmissionCode);
    document.getElementById('btn-copy-from-preview')?.addEventListener('click', () => {
        copySubmissionCode();
        closeModal('modal-form-preview');
    });
    document.getElementById('btn-spin-gacha')?.addEventListener('click', spinDailyGacha);

    // ランキングタブ操作
    document.querySelectorAll('#rank-dept-tabs .dept-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            currentRankDept = btn.dataset.dept;
            renderRankingTab();
        });
    });
    document.getElementById('btn-reload-ranking')?.addEventListener('click', fetchPublicRankingCsv);

    // 設定タブ操作
    document.getElementById('btn-roll-nick-settings')?.addEventListener('click', () => {
        sound.playLightOn();
        const el = document.getElementById('set-nickname');
        if (el) el.value = rollRandomNickname();
    });
    document.getElementById('btn-save-profile')?.addEventListener('click', () => {
        const cls = document.getElementById('set-class')?.value || CFG.classes[0];
        const nick = (document.getElementById('set-nickname')?.value || '').trim() || rollRandomNickname();
        const goal = Math.max(15, Math.min(480, parseInt(document.getElementById('set-daily-goal')?.value, 10) || 60));
        state.profile.className = cls;
        state.profile.nickname = nick.slice(0, 18);
        state.profile.dailyGoalMin = goal;
        state.profile.setupDone = true;
        saveState();
        sound.playSuccess();
        const msg = document.getElementById('profile-save-msg');
        if (msg) msg.textContent = '✅ 保存しました！';
        renderAll();
    });

    // ToDo 操作
    document.getElementById('btn-add-todo')?.addEventListener('click', () => {
        const txtEl = document.getElementById('todo-text');
        const subjEl = document.getElementById('todo-subject');
        const text = (txtEl?.value || '').trim();
        if (!text) return;
        state.todos.unshift({ id: 'td_' + Date.now(), subjectId: subjEl?.value || 'math', text, done: false });
        if (txtEl) txtEl.value = '';
        saveState();
        sound.playClick();
        renderTodoList();
    });
    document.getElementById('todo-list')?.addEventListener('click', e => {
        const toggleId = e.target.dataset?.todoToggle;
        const delId = e.target.dataset?.todoDel;
        if (toggleId) {
            const item = state.todos.find(t => t.id === toggleId);
            if (item) {
                item.done = !item.done;
                saveState();
                sound.playLightOn();
                renderTodoList();
            }
        } else if (delId) {
            state.todos = state.todos.filter(t => t.id !== delId);
            saveState();
            sound.playClick();
            renderTodoList();
        }
    });

    // 端末またぎ引き継ぎ＆QR＆バックアップ
    document.getElementById('btn-show-sync-qr')?.addEventListener('click', showSyncQrCode);
    document.getElementById('btn-export-sync')?.addEventListener('click', exportSyncCode);
    document.getElementById('btn-import-sync')?.addEventListener('click', importSyncCode);
    document.getElementById('btn-confirm-qr-import')?.addEventListener('click', () => {
        if (pendingQrSyncCode) {
            const area = document.getElementById('sync-code-area');
            if (area) area.value = pendingQrSyncCode;
            importSyncCode();
            pendingQrSyncCode = null;
        }
        closeModal('modal-qr-import');
    });
    document.getElementById('btn-backup-json')?.addEventListener('click', downloadBackupJson);
    document.getElementById('btn-restore-json')?.addEventListener('click', () => {
        document.getElementById('input-restore-json')?.click();
    });
    document.getElementById('input-restore-json')?.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (f) restoreBackupJson(f);
        e.target.value = '';
    });

    // アクセシビリティ＆テーマ切替
    const toggleTheme = () => {
        sound.playClick();
        state.a11y.theme = state.a11y.theme === 'light' ? 'dark' : 'light';
        saveState();
        applyA11ySettings();
        showToast(state.a11y.theme === 'light' ? '☀️ 昼モード（明るい教室向け）に切り替えました' : '🌙 夜カフェモードに切り替えました');
    };
    document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);
    document.getElementById('a11y-theme-btn')?.addEventListener('click', toggleTheme);
    document.getElementById('a11y-font-btn')?.addEventListener('click', () => {
        sound.playClick();
        state.a11y.fontScale = state.a11y.fontScale === 'large' ? 'normal' : 'large';
        saveState();
        applyA11ySettings();
        showToast(state.a11y.fontScale === 'large' ? '🔠 文字サイズを大きくしました' : '🔠 文字サイズを標準に戻しました');
    });
    document.getElementById('a11y-cud-btn')?.addEventListener('click', () => {
        sound.playClick();
        state.a11y.cud = !state.a11y.cud;
        saveState();
        applyA11ySettings();
        showToast(state.a11y.cud ? '🎨 色覚サポート（柄補助）をONにしました' : '🎨 色覚サポートをOFFにしました');
    });
    document.getElementById('a11y-motion-btn')?.addEventListener('click', () => {
        sound.playClick();
        state.a11y.reducedMotion = !state.a11y.reducedMotion;
        saveState();
        applyA11ySettings();
        showToast(state.a11y.reducedMotion ? '🧘 動き軽減モードをONにしました' : '🧘 動き軽減モードをOFFにしました');
    });

    // 一時停止・WakeLock・卓上全画面クロック
    document.getElementById('btn-timer-pause')?.addEventListener('click', togglePauseTimer);
    document.getElementById('btn-wakelock')?.addEventListener('click', toggleWakeLock);
    document.getElementById('btn-focus-clock')?.addEventListener('click', () => {
        sound.playClick();
        updateTimerDisplay();
        openModal('modal-focus-clock');
    });
    document.getElementById('btn-focus-start-pause')?.addEventListener('click', () => {
        if (!state.activeTimer) startShiftTimer();
        else togglePauseTimer();
    });
    document.getElementById('btn-focus-finish')?.addEventListener('click', () => finishShiftTimer(false));

    // 今日の履歴（編集＆削除Undo）
    document.getElementById('today-sessions-list')?.addEventListener('click', e => {
        const editBtn = e.target.closest('[data-edit-sess]');
        const delBtn = e.target.closest('[data-del-sess]');
        if (editBtn) openEditSessionModal(editBtn.dataset.editSess);
        else if (delBtn) deleteSessionWithUndo(delBtn.dataset.delSess);
    });
    document.getElementById('btn-save-edit-session')?.addEventListener('click', saveEditedSession);

    // 日報クイック入力タグ
    document.querySelectorAll('#report-quick-tags [data-rtag]').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            const memoEl = document.getElementById('input-report-memo');
            if (!memoEl) return;
            const cur = memoEl.value.trim();
            memoEl.value = cur ? `${cur} ${btn.dataset.rtag}` : btn.dataset.rtag;
            updateReportCounter();
            memoEl.focus();
        });
    });

    // テスト後のふりかえり申し送り
    document.querySelectorAll('#reflect-rating-btns .mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sound.playClick();
            selectedReflectRating = btn.dataset.rrate;
            document.querySelectorAll('#reflect-rating-btns .mood-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
    });
    document.getElementById('btn-save-reflection')?.addEventListener('click', () => {
        const memo = (document.getElementById('input-reflect-memo')?.value || '').trim();
        state.reflection = { rating: selectedReflectRating, memo: memo.slice(0, 100), dismissed: false };
        saveState();
        sound.playSuccess();
        const msg = document.getElementById('reflect-save-msg');
        if (msg) msg.textContent = '💌 保存しました！シフト画面の上部に届きます！';
        renderPrevExamMemoBar();
        showToast('💌 次回の自分への申し送りメモを保存しました！');
    });

    // ♿ モーダル背景クリック閉じ＆Escキー閉じ＆タブ左右キー移動
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
        bd.addEventListener('click', e => {
            if (e.target === bd && bd.id !== 'modal-onboarding' && bd.id !== 'modal-new-year-class') {
                sound.playClick();
                closeModal(bd.id);
            }
        });
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-backdrop.active').forEach(bd => {
                if (bd.id !== 'modal-onboarding' && bd.id !== 'modal-new-year-class') closeModal(bd.id);
            });
        }
    });
    const tabList = document.querySelector('.nav-tabs[role="tablist"]');
    if (tabList) {
        tabList.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const tabs = Array.from(tabList.querySelectorAll('[role="tab"]'));
            const curIdx = tabs.indexOf(document.activeElement);
            if (curIdx === -1) return;
            e.preventDefault();
            const nextIdx = (curIdx + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
            tabs[nextIdx].focus();
            switchTab(tabs[nextIdx].dataset.tab);
        });
    }

    // 初期化
    document.getElementById('btn-reset-all')?.addEventListener('click', () => {
        if (!confirm('この端末の勉強履歴・図鑑データをすべて初期化しますか？')) return;
        localStorage.removeItem(STORAGE_KEY);
        state = createDefaultState();
        saveState();
        location.reload();
    });
}

function saveAmbientPref() {
    const mix = ambient.getCurrentMixObject();
    if (!state.ambientPref) {
        state.ambientPref = { masterVol: 55, autoWithTimer: false, lastPreset: 'night_rain_cafe', lastMix: mix };
    }
    if (Object.keys(mix).length > 0) {
        state.ambientPref.lastMix = mix;
        state.ambientPref.lastPreset = ambient.activePreset;
    }
    state.ambientPref.masterVol = Math.round(ambient.masterVol * 100);
    saveState();
}

function initAmbientMixerUI() {
    const pref = state.ambientPref || { masterVol: 55, autoWithTimer: false };
    ambient.setMasterVolume((Number(pref.masterVol) || 55) / 100);

    const grid = document.getElementById('mixer-track-grid');
    if (grid && !grid.children.length) {
        grid.innerHTML = AMBIENT_TRACKS.map(t => `
            <div class="mixer-track-card" data-amb-card="${escapeHtml(t.id)}">
                <div class="mixer-track-top">
                    <button type="button" class="mixer-track-toggle" data-amb-toggle="${escapeHtml(t.id)}" aria-pressed="false">
                        <span>${escapeHtml(t.icon)}</span>
                        <span>${escapeHtml(t.name)}</span>
                    </button>
                    <span class="mixer-track-tag">${escapeHtml(t.tag)}</span>
                </div>
                <div class="mixer-track-vol-row">
                    <input type="range" class="mixer-track-slider" data-amb-vol="${escapeHtml(t.id)}"
                        min="5" max="100" value="${t.defaultVol}" aria-label="${escapeHtml(t.name)}の音量">
                    <span class="mixer-track-pct" data-amb-pct="${escapeHtml(t.id)}">${t.defaultVol}%</span>
                </div>
            </div>
        `).join('');
    }
    syncAmbientUI();
}

function syncAmbientUI() {
    const activeList = ambient.getActiveTracks();
    const activePreset = ambient.detectPresetId();
    const volPct = Math.round(ambient.masterVol * 100);

    // プリセットボタン同期（シフト画面＋全画面クロック）
    document.querySelectorAll('#ambient-presets .amb-btn, #focus-ambient-presets .amb-btn').forEach(btn => {
        const pid = btn.dataset.preset;
        const isMatch = (pid === 'off' && activeList.length === 0) || (pid !== 'off' && pid === activePreset);
        btn.classList.toggle('active', isMatch);
    });

    // 再生中バッジ同期
    let statusText = '🔇 停止中';
    if (activeList.length > 0) {
        if (AMBIENT_PRESETS[activePreset]) {
            statusText = `🔊 ${AMBIENT_PRESETS[activePreset].label}（${activeList.length}音）`;
        } else {
            const names = activeList.slice(0, 2).map(t => `${t.meta.icon}${t.meta.name}`).join('＋');
            const more = activeList.length > 2 ? ` 他${activeList.length - 2}` : '';
            statusText = `🔊 MIX：${names}${more}`;
        }
    }
    const badge = document.getElementById('ambient-now-badge');
    if (badge) {
        badge.textContent = statusText;
        badge.classList.toggle('playing', activeList.length > 0);
    }
    const focusStatus = document.getElementById('focus-amb-status');
    if (focusStatus) focusStatus.textContent = statusText;

    // マスター音量＆タイマー連動同期
    const v1 = document.getElementById('ambient-vol');
    const v2 = document.getElementById('focus-ambient-vol');
    const vLbl = document.getElementById('ambient-vol-val');
    if (v1 && Number(v1.value) !== volPct) v1.value = String(volPct);
    if (v2 && Number(v2.value) !== volPct) v2.value = String(volPct);
    if (vLbl) vLbl.textContent = `${volPct}%`;

    const autoChk = document.getElementById('chk-ambient-auto');
    if (autoChk) autoChk.checked = Boolean(state.ambientPref?.autoWithTimer);

    // 全11トラックカード同期
    const grid = document.getElementById('mixer-track-grid');
    if (grid) {
        ambient.tracks.forEach((tr, id) => {
            const card = grid.querySelector(`[data-amb-card="${id}"]`);
            const btn = grid.querySelector(`[data-amb-toggle="${id}"]`);
            const sl = grid.querySelector(`[data-amb-vol="${id}"]`);
            const pctEl = grid.querySelector(`[data-amb-pct="${id}"]`);
            const tPct = Math.round(tr.vol * 100);
            if (card) card.classList.toggle('on', tr.active);
            if (btn) btn.setAttribute('aria-pressed', String(tr.active));
            if (sl && document.activeElement !== sl) sl.value = String(tPct);
            if (pctEl) pctEl.textContent = `${tPct}%`;
        });
    }
}

// 起動！
document.addEventListener('DOMContentLoaded', () => {
    const linkedFromUrl = initSchoolConfigLink();
    applyA11ySettings();
    checkStorageHealth();
    initAmbientMixerUI();
    bindEvents();
    renderAll();
    initOnboarding();
    checkNewSchoolYearPrompt();
    checkIncomingQrSync();
    if (linkedFromUrl) {
        const exam = getActiveExamInfo();
        showToast(`🔗 「${exam.name}」の学校フォーム連携を自動設定しました！`, { duration: 4800 });
    }
    if (state.activeTimer) {
        ensureTimerLoop();
    }
    if (CFG.rankingBoard.publicCsvUrl) {
        fetchPublicRankingCsv();
    }
});

