import SwiftUI

/// Le due spezzate di un report, sovrapposte sulla stessa scala: quella grigia
/// e' il periodo precedente, quella viola il corrente. Sopra il grafico resta
/// una striscia libera per le etichette, che altrimenti verrebbero tagliate.
struct ReportChart: View {
    let previous: [Double]
    let current: [Double]

    private let badgeStrip: CGFloat = 24
    private let plotHeight: CGFloat = 100
    private let dotRadius: CGFloat = 4.5

    var body: some View {
        GeometryReader { geo in
            let plotWidth = max(1, geo.size.width - dotRadius)
            let scale = Scale(previous + current)

            ZStack(alignment: .topLeading) {
                grid(width: plotWidth)

                line(previous, width: plotWidth, scale: scale)
                    .stroke(Theme.mutedLine, style: StrokeStyle(lineWidth: 1.2, lineJoin: .round))

                line(current, width: plotWidth, scale: scale)
                    .stroke(Theme.accentLight, style: StrokeStyle(lineWidth: 2.4, lineJoin: .round))

                if let last = point(current, current.count - 1, width: plotWidth, scale: scale) {
                    Circle()
                        .fill(Theme.accentLight)
                        .frame(width: dotRadius * 2, height: dotRadius * 2)
                        .position(last)
                }

                ForEach(badges(width: plotWidth, scale: scale)) { badge in
                    Badge(text: badge.text, color: badge.color)
                        .offset(x: badge.x, y: badge.y)
                }
            }
        }
        .frame(height: badgeStrip + plotHeight)
    }

    // MARK: - Geometria

    /// Le due serie condividono minimo e massimo: e' l'unico modo perche' due
    /// picchi uguali finiscano alla stessa altezza, come nell'originale.
    private struct Scale {
        let low: Double
        let span: Double

        init(_ values: [Double]) {
            let lo = values.min() ?? 0
            let hi = values.max() ?? 1
            low = lo
            span = hi - lo == 0 ? 1 : hi - lo
        }

        func fraction(_ value: Double) -> CGFloat { CGFloat((value - low) / span) }
    }

    private func point(_ series: [Double], _ index: Int, width: CGFloat, scale: Scale) -> CGPoint? {
        guard series.indices.contains(index) else { return nil }
        let step = series.count > 1 ? width / CGFloat(series.count - 1) : 0
        let y = badgeStrip + (1 - scale.fraction(series[index])) * plotHeight
        return CGPoint(x: step * CGFloat(index), y: y)
    }

    private func line(_ series: [Double], width: CGFloat, scale: Scale) -> Path {
        Path { path in
            for index in series.indices {
                guard let p = point(series, index, width: width, scale: scale) else { continue }
                if index == 0 { path.move(to: p) } else { path.addLine(to: p) }
            }
        }
    }

    /// Una linea verticale per ogni rilevazione, appena percettibile.
    private func grid(width: CGFloat) -> some View {
        Path { path in
            let step = current.count > 1 ? width / CGFloat(current.count - 1) : 0
            for index in current.indices {
                let x = step * CGFloat(index)
                path.move(to: CGPoint(x: x, y: badgeStrip))
                path.addLine(to: CGPoint(x: x, y: badgeStrip + plotHeight))
            }
        }
        .stroke(Theme.gridLine, lineWidth: 1)
    }

    // MARK: - Etichette

    private struct PlacedBadge: Identifiable {
        let id = UUID()
        let text: String
        let color: Color
        let x: CGFloat
        let y: CGFloat
    }

    /// Tre etichette, come nello screenshot: il massimo del periodo precedente
    /// in grigio, massimo e minimo del corrente in viola. Ognuna sta appoggiata
    /// sopra il proprio punto, ma se due punti sono vicini le etichette si
    /// scanserebbero a vicenda: quella che arriva dopo scivola di lato, e se
    /// non c'e' piu' spazio sale di una riga.
    private func badges(width: CGFloat, scale: Scale) -> [PlacedBadge] {
        var out: [PlacedBadge] = []
        var placed: [CGRect] = []

        func place(_ series: [Double], _ index: Int?, _ color: Color) {
            guard let index, let p = point(series, index, width: width, scale: scale) else { return }
            let text = money(series[index])
            let estimated = CGFloat(text.count) * 8.4 + 14
            let home = min(max(0, p.x - estimated / 2), max(0, width - estimated))

            var rect = CGRect(
                x: home,
                y: max(0, p.y - Badge.height - 3),
                width: estimated,
                height: Badge.height
            )

            var attempts = 0
            while let hit = placed.first(where: { $0.intersects(rect) }), attempts < 20 {
                rect.origin.x = hit.maxX + 4
                if rect.maxX > width {
                    rect.origin.x = home
                    rect.origin.y = max(0, rect.origin.y - Badge.height - 3)
                }
                attempts += 1
            }

            placed.append(rect)
            out.append(PlacedBadge(text: text, color: color, x: rect.origin.x, y: rect.origin.y))
        }

        place(previous, indexOfMax(previous), Theme.badgeGrey)
        place(current, indexOfMax(current), Theme.accent)
        place(current, indexOfMin(current), Theme.accent)
        return out
    }

    private func indexOfMax(_ series: [Double]) -> Int? {
        series.indices.max(by: { series[$0] < series[$1] })
    }

    private func indexOfMin(_ series: [Double]) -> Int? {
        series.indices.min(by: { series[$0] < series[$1] })
    }

    private struct Badge: View {
        static let height: CGFloat = 21

        let text: String
        let color: Color

        var body: some View {
            Text(text)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.white)
                .padding(.horizontal, 7)
                .frame(height: Badge.height)
                .background(color, in: RoundedRectangle(cornerRadius: 5, style: .continuous))
        }
    }
}
