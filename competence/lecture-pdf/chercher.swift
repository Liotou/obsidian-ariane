import Foundation
import PDFKit
let a = CommandLine.arguments
guard a.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: a[1])) else { print("PDF illisible"); exit(1) }
func norm(_ s: String) -> String { s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil) }
let mots = norm(a[2...].joined(separator: " ")).split(separator: " ").map(String.init).filter { $0.count > 1 }
var n = 0
for i in 0..<doc.pageCount {
  guard let p = doc.page(at: i), let t = p.string else { continue }
  let plat = norm(t).replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
  if !mots.allSatisfy({ plat.contains($0) }) { continue }
  n += 1; if n > 40 { break }
  let lab = p.label ?? ""
  let r = plat.range(of: mots[0])!
  let k = plat.distance(from: plat.startIndex, to: r.lowerBound)
  let brut = t.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
  let d = brut.index(brut.startIndex, offsetBy: max(0, min(k - 120, brut.count)))
  let f = brut.index(d, offsetBy: min(320, brut.distance(from: d, to: brut.endIndex)))
  print("page \(i + 1)" + (lab.isEmpty || lab == String(i + 1) ? "" : " (imprimée \(lab))") + " : …" + brut[d..<f] + "…")
}
print("\(doc.pageCount) pages, \(min(n, 40)) résultat(s)")
