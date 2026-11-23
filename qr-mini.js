/**
 * ============================================================================
 * 軽量・ゼロ依存 QRコード生成モジュール (qr-mini.js)
 * - 外部CDN通信なし（学校ネットワーク制限下＆オフラインで100%動作）
 * - ISO/IEC 18004 バイトモード / 誤り訂正レベル L / Version 1〜20 自動選択
 *   （最大 858 バイトまで1枚のQRコードに格納可能）
 * ============================================================================
 */
(function (global) {
    'use strict';

    // GF(256) 対数・指数テーブル (多項式 0x11d)
    const EXP = new Uint8Array(512);
    const LOG = new Uint8Array(256);
    (function initGF() {
        let x = 1;
        for (let i = 0; i < 255; i++) {
            EXP[i] = x;
            LOG[x] = i;
            x <<= 1;
            if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
    })();

    function gfMul(a, b) {
        return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
    }

    function rsGenerator(degree) {
        let poly = [1];
        for (let i = 0; i < degree; i++) {
            const next = new Array(poly.length + 1).fill(0);
            for (let j = 0; j < poly.length; j++) {
                next[j] ^= poly[j];
                next[j + 1] ^= gfMul(poly[j], EXP[i]);
            }
            poly = next;
        }
        return poly;
    }

    function rsRemainder(data, ecLen) {
        const gen = rsGenerator(ecLen);
        const res = new Uint8Array(data.length + ecLen);
        res.set(data);
        for (let i = 0; i < data.length; i++) {
            const factor = res[i];
            if (factor !== 0) {
                for (let j = 0; j < gen.length; j++) {
                    res[i + j] ^= gfMul(gen[j], factor);
                }
            }
        }
        return res.slice(data.length);
    }

    // Version 1..20 (ECC Level L): [totalCodewords, ecPerBlock, [[numBlocks, dataCodewords], ...], alignPositions]
    const VER_INFO = [
        null,
        [26,   7,  [[1, 19]],             []],
        [44,   10, [[1, 34]],             [6, 18]],
        [70,   15, [[1, 55]],             [6, 22]],
        [100,  20, [[1, 80]],             [6, 26]],
        [134,  26, [[1, 108]],            [6, 30]],
        [172,  18, [[2, 68]],             [6, 34]],
        [196,  20, [[2, 78]],             [6, 22, 38]],
        [242,  24, [[2, 97]],             [6, 24, 42]],
        [292,  30, [[2, 116]],            [6, 26, 46]],
        [346,  18, [[2, 68], [2, 69]],    [6, 28, 50]],
        [404,  20, [[4, 81]],             [6, 30, 54]],
        [466,  24, [[2, 92], [2, 93]],    [6, 32, 58]],
        [532,  26, [[4, 107]],            [6, 34, 62]],
        [581,  30, [[3, 115], [1, 116]],  [6, 26, 46, 66]],
        [655,  22, [[5, 87], [1, 88]],    [6, 26, 48, 70]],
        [733,  24, [[5, 98], [1, 99]],    [6, 26, 50, 74]],
        [815,  28, [[1, 107], [5, 108]],  [6, 30, 54, 78]],
        [901,  30, [[5, 120], [1, 121]],  [6, 30, 56, 82]],
        [991,  28, [[3, 113], [4, 114]],  [6, 30, 58, 86]],
        [1085, 28, [[3, 107], [5, 108]],  [6, 34, 62, 90]]
    ];

    function calcDataCapacity(ver) {
        return VER_INFO[ver][2].reduce((a, [cnt, dc]) => a + cnt * dc, 0);
    }

    function encodeDataBytes(text) {
        const bytes = new TextEncoder().encode(text);
        let ver = 0;
        for (let v = 1; v < VER_INFO.length; v++) {
            const cap = calcDataCapacity(v);
            const headerBytes = v < 10 ? 2 : 3; // 4bit mode + 8/16bit len + 4bit term ~ max 2-3 bytes
            if (bytes.length + headerBytes <= cap) {
                ver = v;
                break;
            }
        }
        if (!ver) return null;

        const capBytes = calcDataCapacity(ver);
        const bits = [];
        const pushBits = (val, n) => {
            for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
        };
        // Byte mode (0100)
        pushBits(0b0100, 4);
        pushBits(bytes.length, ver < 10 ? 8 : 16);
        bytes.forEach(b => pushBits(b, 8));
        // Terminator & padding
        const maxBits = capBytes * 8;
        const term = Math.min(4, maxBits - bits.length);
        for (let i = 0; i < term; i++) bits.push(0);
        while (bits.length % 8 !== 0) bits.push(0);
        const pads = [0xEC, 0x11];
        let pIdx = 0;
        while (bits.length < maxBits) {
            pushBits(pads[pIdx % 2], 8);
            pIdx++;
        }

        const dataCW = new Uint8Array(capBytes);
        for (let i = 0; i < capBytes; i++) {
            let v = 0;
            for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
            dataCW[i] = v;
        }

        // ブロック分割＆RS誤り訂正インターリーブ
        const [, ecLen, groups] = VER_INFO[ver];
        const dataBlocks = [];
        const ecBlocks = [];
        let offset = 0;
        groups.forEach(([cnt, dc]) => {
            for (let i = 0; i < cnt; i++) {
                const slice = dataCW.slice(offset, offset + dc);
                offset += dc;
                dataBlocks.push(slice);
                ecBlocks.push(rsRemainder(slice, ecLen));
            }
        });

        const finalCW = [];
        const maxDc = Math.max(...dataBlocks.map(b => b.length));
        for (let i = 0; i < maxDc; i++) {
            dataBlocks.forEach(b => { if (i < b.length) finalCW.push(b[i]); });
        }
        for (let i = 0; i < ecLen; i++) {
            ecBlocks.forEach(b => finalCW.push(b[i]));
        }
        return { ver, codewords: finalCW };
    }

    function calcFormatBits(mask) {
        // ECC Level L = 01
        const data = (0b01 << 3) | mask;
        let rem = data << 10;
        const gen = 0b10100110111;
        for (let i = 14; i >= 10; i--) {
            if ((rem >>> i) & 1) rem ^= gen << (i - 10);
        }
        return ((data << 10) | rem) ^ 0b101010000010010;
    }

    function calcVersionBits(ver) {
        let rem = ver << 12;
        const gen = 0b1111100100101;
        for (let i = 17; i >= 12; i--) {
            if ((rem >>> i) & 1) rem ^= gen << (i - 12);
        }
        return (ver << 12) | rem;
    }

    function buildMatrix(ver, codewords) {
        const size = ver * 4 + 17;
        const mod = Array.from({ length: size }, () => new Int8Array(size)); // 0=empty, 1=black, -1=white
        const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

        const setFunc = (r, c, dark) => {
            if (r < 0 || c < 0 || r >= size || c >= size) return;
            mod[r][c] = dark ? 1 : -1;
            isFunc[r][c] = 1;
        };

        const placeFinder = (r0, c0) => {
            for (let dr = -1; dr <= 7; dr++) {
                for (let dc = -1; dc <= 7; dc++) {
                    const r = r0 + dr, c = c0 + dc;
                    if (r < 0 || c < 0 || r >= size || c >= size) continue;
                    const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
                    const border = dr === 0 || dr === 6 || dc === 0 || dc === 6;
                    const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
                    setFunc(r, c, inOuter && (border || center));
                }
            }
        };

        placeFinder(0, 0);
        placeFinder(0, size - 7);
        placeFinder(size - 7, 0);

        // Timing patterns
        for (let i = 8; i < size - 8; i++) {
            setFunc(6, i, i % 2 === 0);
            setFunc(i, 6, i % 2 === 0);
        }

        // Alignment patterns（3隅のファインダー位置のみ除外し、タイミング線上は仕様通り重ね描き）
        const pos = VER_INFO[ver][3];
        const last = pos.length - 1;
        for (let i = 0; i < pos.length; i++) {
            for (let j = 0; j < pos.length; j++) {
                if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
                const r0 = pos[i], c0 = pos[j];
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        const d = Math.max(Math.abs(dr), Math.abs(dc));
                        setFunc(r0 + dr, c0 + dc, d === 0 || d === 2);
                    }
                }
            }
        }

        // Dark module & reserve format areas
        setFunc(size - 8, 8, true);
        for (let i = 0; i < 9; i++) {
            if (!isFunc[8][i]) isFunc[8][i] = 1;
            if (!isFunc[i][8]) isFunc[i][8] = 1;
        }
        for (let i = 0; i < 8; i++) {
            isFunc[8][size - 1 - i] = 1;
            isFunc[size - 1 - i][8] = 1;
        }

        // Version info (ver >= 7)
        if (ver >= 7) {
            const vbits = calcVersionBits(ver);
            for (let i = 0; i < 18; i++) {
                const bit = ((vbits >>> i) & 1) === 1;
                const r = Math.floor(i / 3);
                const c = size - 11 + (i % 3);
                setFunc(r, c, bit);
                setFunc(c, r, bit);
            }
        }

        // Place data bits zigzag
        const bits = [];
        codewords.forEach(cw => {
            for (let i = 7; i >= 0; i--) bits.push((cw >>> i) & 1);
        });
        let bitIdx = 0;
        let upward = true;
        for (let col = size - 1; col >= 1; col -= 2) {
            if (col === 6) col--;
            for (let step = 0; step < size; step++) {
                const row = upward ? (size - 1 - step) : step;
                for (let dx = 0; dx < 2; dx++) {
                    const c = col - dx;
                    if (!isFunc[row][c]) {
                        const b = bitIdx < bits.length ? bits[bitIdx++] : 0;
                        mod[row][c] = b ? 1 : -1;
                    }
                }
            }
            upward = !upward;
        }

        // Mask 0 ((r + c) % 2 === 0) を適用して軽量かつ確実にデコード可能にする
        const mask = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (!isFunc[r][c] && ((r + c) % 2 === 0)) {
                    mod[r][c] = -mod[r][c];
                }
            }
        }

        // Write format info
        const fbits = calcFormatBits(mask);
        const fCoords1 = [
            [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
            [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
        ];
        const fCoords2 = [
            [size - 1, 8], [size - 2, 8], [size - 3, 8], [size - 4, 8], [size - 5, 8], [size - 6, 8], [size - 7, 8],
            [8, size - 8], [8, size - 7], [8, size - 6], [8, size - 5], [8, size - 4], [8, size - 3], [8, size - 2], [8, size - 1]
        ];
        for (let i = 0; i < 15; i++) {
            const dark = ((fbits >>> (14 - i)) & 1) === 1;
            const [r1, c1] = fCoords1[i];
            const [r2, c2] = fCoords2[i];
            mod[r1][c1] = dark ? 1 : -1;
            mod[r2][c2] = dark ? 1 : -1;
        }
        return mod;
    }

    function drawToCanvas(canvas, text, pxSize = 210) {
        if (!canvas) return false;
        const enc = encodeDataBytes(text);
        if (!enc) return false;
        const mat = buildMatrix(enc.ver, enc.codewords);
        const n = mat.length;
        const quiet = 4;
        const total = n + quiet * 2;
        const scale = Math.max(2, Math.floor(pxSize / total));
        const realPx = total * scale;
        canvas.width = realPx;
        canvas.height = realPx;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, realPx, realPx);
        ctx.fillStyle = '#0F172A';
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                if (mat[r][c] === 1) {
                    ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
                }
            }
        }
        return true;
    }

    global.QRMini = { drawToCanvas };
})(window);

