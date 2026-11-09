// 라이브러리 없이 만드는 작은 엑셀 파일. 글자 칸만 쓰고, 첫 줄은 굵게 고정한다 (zip 은 압축 없이 저장)

const encoder = new TextEncoder()

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** 작은 값들을 리틀 엔디언으로 이어 붙인다. [값, 바이트 수] */
function fields(list: [number, 2 | 4][]): Uint8Array {
  const out = new Uint8Array(list.reduce((a, [, n]) => a + n, 0))
  const view = new DataView(out.buffer)
  let at = 0
  for (const [v, n] of list) {
    if (n === 2) view.setUint16(at, v, true)
    else view.setUint32(at, v, true)
    at += n
  }
  return out
}

function zip(files: [string, string][]): Uint8Array<ArrayBuffer> {
  const FLAGS: [number, 2][] = [
    [20, 2], // 필요한 버전
    [0x0800, 2], // 이름은 UTF-8
    [0, 2], // 압축 없음
    [0, 2], // 시각
    [0x0021, 2], // 날짜 1980-01-01
  ]
  const body: Uint8Array[] = []
  const directory: Uint8Array[] = []
  let offset = 0
  for (const [name, text] of files) {
    const nameBytes = encoder.encode(name)
    const data = encoder.encode(text)
    const sizes: [number, 4 | 2][] = [
      [crc32(data), 4],
      [data.length, 4],
      [data.length, 4],
      [nameBytes.length, 2],
      [0, 2],
    ]
    const local = [fields([[0x04034b50, 4], ...FLAGS, ...sizes]), nameBytes, data]
    directory.push(fields([[0x02014b50, 4], [20, 2], ...FLAGS, ...sizes, [0, 2], [0, 2], [0, 2], [0, 4], [offset, 4]]), nameBytes)
    body.push(...local)
    offset += local.reduce((a, b) => a + b.length, 0)
  }
  const size = directory.reduce((a, b) => a + b.length, 0)
  const end = fields([[0x06054b50, 4], [0, 2], [0, 2], [files.length, 2], [files.length, 2], [size, 4], [offset, 4], [0, 2]])
  const parts = [...body, ...directory, end]
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const DOC_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

const esc = (s: string) =>
  s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const column = (i: number) => String.fromCharCode(65 + i)

/** 첫 줄을 머리글로 하는 표 한 장을 엑셀 파일로 만든다 */
export function buildXlsx(sheetName: string, rows: string[][], widths: number[]): Uint8Array<ArrayBuffer> {
  const sheetRows = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => (v ? `<c r="${column(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>` : ''))
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  return zip([
    [
      '[Content_Types].xml',
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    ['_rels/.rels', `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${HEAD}<workbook xmlns="${MAIN}" xmlns:r="${DOC_REL}"><bookViews><workbookView/></bookViews><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${HEAD}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${DOC_REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${DOC_REL}/styles" Target="styles.xml"/></Relationships>`],
    [
      'xl/styles.xml',
      `${HEAD}<styleSheet xmlns="${MAIN}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ],
    [
      'xl/worksheets/sheet1.xml',
      `${HEAD}<worksheet xmlns="${MAIN}"><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${cols}</cols><sheetData>${sheetRows}</sheetData></worksheet>`,
    ],
  ])
}
