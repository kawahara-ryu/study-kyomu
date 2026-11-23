/**
 * ============================================================================
 * テスト前夜の虚無バイト（StudyKYOMU+） 学校別・定期試験設定ファイル (config.js)
 * ----------------------------------------------------------------------------
 * ★先生へ：学校の定期試験に合わせてここを書き換えるだけで全校運用できます！
 *   同梱の `teacher_dashboard.html` を使うと、画面入力だけでこのファイルを
 *   自動生成＆Googleフォーム自動作成スクリプトも1クリックでコピーできます。
 * ============================================================================
 */

window.KYOMU_CONFIG = {
    schoolName: "わが校 定期試験特設スタジオ",
    // 年度（空欄なら端末の現在年度を基準／?cfg= で新年度が届くと自動で進級クラス変更画面が出ます）
    schoolYear: "",
    examName: "定期考査",
    // 空文字 "" の場合は画面上のバッジ（またはURLパラメータ ?exam=...&date=...）から毎回設定できます。
    // 固定したい場合は "2026-12-07" のように YYYY-MM-DD 形式で入力してください。
    examDate: "",

    // 学校のクラス選択肢（1〜3学年 × 各8組＝24クラス／自由に追加・変更OK）
    classes: [
        "1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8",
        "2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8",
        "3-1", "3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-8"
    ],

    // 二つ名（ニックネーム）設定
    // true: 「虚無二つ名ガチャ」と「自由入力」のどちらも使える
    // false: 不適切ネーム防止のため「虚無二つ名ガチャ」のみ許可
    allowFreeNickname: true,

    // 改ざん検知チェックサム用の学校独自キー（teacher_dashboard.html / GAS側と同じ文字列にする）
    securitySalt: "KYOMU-SCHOOL-2026",

    // 健康＆チート対策ルール
    rules: {
        minSessionMinutes: 1,         // 1回あたりの最小記録時間（分）
        maxSessionMinutes: 120,       // 1回あたりの上限（放置寝落ち対策）
        maxManualPerDayMinutes: 180,  // 紙ノート事後申請の1日上限（分）
        minReportLength: 8,           // 業務日報の最低文字数
        gachaUnlockMinutes: 15,       // 退勤ガチャ解放に必要な当日勉強時間（初回のみ1分から体験可）
        morningBonusStartHour: 5,     // 朝勉ボーナス開始時（5:00）
        morningBonusEndHour: 8,       // 朝勉ボーナス終了時（8:00未満）
        morningMultiplier: 1.2,       // 朝勉ポイント倍率
        lateNightStartHour: 23,       // 深夜残業ブレーキ開始（23:30〜）
        lateNightStartMin: 30,
        lateNightEndHour: 5,          // 深夜残業ブレーキ終了（5:00未満）
        lateNightMultiplier: 0.5,     // 深夜ポイント倍率（徹夜マウント防止）
        earlySleepBonusLimitHour: 23, // 23:00未満の退勤で「早寝ボーナス」付与
        earlySleepBonusPoints: 10     // 早寝ボーナス（有効ポイント加算）
    },

    // 全校協力レイドボス設定
    raidBoss: {
        name: "赤点ちくわ大魔王",
        title: "定期試験を支配する虚無の巨神",
        maxHp: 30000 // 全校で30,000pt（約500時間）稼ぐと撃破！
    },

    // Google Classroom × 事前入力Googleフォーム連携（プランA・?cfg=URL自動接続対応）
    // ★GitHub編集不要！GASスプレッドシートが発行する ?cfg=... 配布リンクを生徒が開くだけで
    //   この設定が端末へ自動接続されるため、通常ここは空のままで全校運用できます。
    googleForm: {
        enabled: false,
        prefillBaseUrl: "",
        entries: {
            examName: "entry.1000000",
            date: "entry.1000001",
            className: "entry.1000002",
            nickname: "entry.1000003",
            totalMinutes: "entry.1000004",
            effectivePoints: "entry.1000005",
            subjectBreakdown: "entry.1000006",
            dailyReports: "entry.1000007",
            streakDays: "entry.1000008",
            verifyCode: "entry.1000009"
        }
    },

    // 公開ランキング連携（学年・クラスClassroom公開対応）
    rankingBoard: {
        // Classroomで公開する「公開用_二つ名ランキング（別ブック）」の閲覧URLを貼るとアプリ内からも開けます（空欄でもOK）
        publicBoardUrl: "",
        // 公開シートを「ウェブに公開(CSV)」したURLを貼るとアプリ内にもリアルタイム自動表示されます（任意）
        publicCsvUrl: "",
        // 未連携時に架空デモ生徒を表示するか（false＝Classroom公開運用向け・自分の戦績カードを表示）
        showDemoWhenUnlinked: false
    },

    // デフォルト教科プリセット（生徒側で自分の科目を追加することも可能）
    subjects: [
        {
            id: "math",
            name: "数学",
            icon: "📐",
            color: "#22D3EE",
            charId: "penguin",
            charName: "チルペンギン",
            menuName: "ちくわパフェ",
            menuIcon: "🍨",
            mutters: [
                "公式ぜんぶ氷山に忘れてきたペン…とりあえず1問だけ解くペン…",
                "時給1,100円で二次関数見てるペン…早く定時で帰って寝たいペン…",
                "計算ミスしても地球は回るペン。でもあと15分だけやるペン…"
            ]
        },
        {
            id: "english",
            name: "英語",
            icon: "🔤",
            color: "#FACC15",
            charId: "banana",
            charName: "ボクバナナ",
            menuName: "皮むけパンケーキ",
            menuIcon: "🥞",
            mutters: [
                "英単語10個覚えたら皮がちょっとむけたバナナ…寒いバナナ…",
                "関係代名詞とか知らないバナナ…でも15分やったらプリン食べるバナナ…",
                "発音より先にコタツの電源入れたいバナナ…もう熟れすぎてるバナナ…"
            ]
        },
        {
            id: "japanese",
            name: "国語",
            icon: "📖",
            color: "#FB923C",
            charId: "shiba",
            charName: "拒否柴",
            menuName: "断固拒否おにぎり",
            menuIcon: "🍙",
            mutters: [
                "古文単語の暗記は断固拒否したいワン…でも15分なら座ってあげるワン…",
                "筆者の気持ち？たぶん早く帰って寝たいと思ってるワン…",
                "散歩もテストも拒否したいけど、おにぎりくれるならやるワン…"
            ]
        },
        {
            id: "science",
            name: "理科",
            icon: "🧪",
            color: "#34D399",
            charId: "hammy",
            charName: "徹夜ハムスター",
            menuName: "エナジーゼリー",
            menuIcon: "🍮",
            mutters: [
                "頬袋に化学式を詰め込みすぎて目が虚無ってるハム…",
                "物理の法則より布団の引力が強すぎるハム…誰か助けてハム…",
                "徹夜はダメって店長に怒られたハム。今日は23時前に寝るハム…"
            ]
        },
        {
            id: "social",
            name: "地歴公民",
            icon: "🌍",
            color: "#F43F5E",
            charId: "takoyaki",
            charName: "虚無たこ焼き",
            menuName: "歴史たこ焼きタワー",
            menuIcon: "🐙",
            mutters: [
                "年号ぜんぶソースで塗りつぶしたいタコ…でも意外と語呂合わせいけるタコ…",
                "時給1,100円で世界史を暗記してるタコ…そろそろ冷めてきたタコ…",
                "地図帳を枕にしたら3時間ワープしたタコ…今度こそ15分やるタコ…"
            ]
        },
        {
            id: "info",
            name: "情報I",
            icon: "💻",
            color: "#FF4DA6",
            charId: "cat",
            charName: "無気力ネコビッツ",
            menuName: "2進数バーガー",
            menuIcon: "🍔",
            mutters: [
                "時給1,100円で2進数バーガー焼いてるニャ…早く退勤して14時間寝たいニャ…",
                "配列の添字ズレてても気にしないニャ…いやテストは気にするニャ…",
                "深夜残業すると労基署と保健室の先生が来るから早めに退勤するニャ…"
            ]
        },
        {
            id: "other",
            name: "実技・その他",
            icon: "🎨",
            color: "#A855F7",
            charId: "chikuwa",
            charName: "屋上ちくわ",
            menuName: "深夜ウインナー定食",
            menuIcon: "🌭",
            mutters: [
                "副教科をナメるとテスト前日に泣くチクワ…いま15分だけ片付けるチクワ…",
                "穴の向こうに希望が見える気がするチクワ…たぶん気のせいチクワ…",
                "プリント1枚読んだだけで今日はもう優勝チクワ…"
            ]
        }
    ]
};

