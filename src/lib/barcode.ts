const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

export function code128Bars(value: string) {
  if (!/^[\x20-\x7e]+$/.test(value)) return [];
  const codes = [...value].map((char) => char.charCodeAt(0) - 32);
  let checksum = START_B;
  codes.forEach((code, index) => {
    checksum += code * (index + 1);
  });
  checksum %= 103;
  const symbols = [START_B, ...codes, checksum, STOP];
  const bars: { ink: boolean; width: number }[] = [{ ink: false, width: 10 }];
  for (const symbol of symbols) {
    const pattern = PATTERNS[symbol];
    if (!pattern) return [];
    let ink = true;
    for (const digit of pattern) {
      bars.push({ ink, width: Number(digit) });
      ink = !ink;
    }
  }
  bars.push({ ink: false, width: 10 });
  return bars;
}

export function barcodeSvg(value: string) {
  const bars = code128Bars(value);
  if (bars.length === 0) return "";
  const total = bars.reduce((sum, bar) => sum + bar.width, 0);
  let x = 0;
  const rects = bars
    .map((bar) => {
      const mark = bar.ink ? `<rect x="${x}" y="0" width="${bar.width}" height="50" fill="#0f172a"/>` : "";
      x += bar.width;
      return mark;
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 50" role="img" aria-label="Barcode ${escapeAttr(value)}">${rects}</svg>`;
}

function escapeAttr(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}
