import SwiftUI

/// Le icone della barra in basso, disegnate a mano.
///
/// Non sono simboli di sistema: quelle di Stripe hanno forme proprie e messe
/// accanto si riconoscono subito. La casa ha la porta ad arco vuota invece del
/// quadrotto pieno, i pagamenti sono due banconote impilate con la cifra
/// dentro, il portafoglio ha la patta inclinata.
///
/// Le coordinate non sono a occhio: vengono dalla mappa dei pixel dello
/// screenshot originale, letta a due pixel per carattere. La griglia e' 24x24
/// e vale 20pt, quindi un'unita' sono 2.5 pixel dello screenshot.
struct TabIcon: View {
    let tab: Tab

    /// Il tratto misurato: 6 pixel sullo screenshot, cioe' 2pt.
    private static let stroke: CGFloat = 2

    var body: some View {
        Canvas { context, size in
            let scale = size.width / 24
            var transform = CGAffineTransform(scaleX: scale, y: scale)
            let raw = Self.path(for: tab)

            context.stroke(
                Path(raw.copy(using: &transform) ?? raw),
                with: .style(.foreground),
                style: StrokeStyle(lineWidth: Self.stroke, lineCap: .round, lineJoin: .round)
            )

            if let dot = Self.dot(for: tab) {
                context.fill(Path(dot.copy(using: &transform) ?? dot), with: .style(.foreground))
            }
        }
        .frame(width: 20, height: 20)
    }

    private static func path(for tab: Tab) -> CGPath {
        let p = CGMutablePath()

        switch tab {
        case .home:
            // Fianchi, tetto e base: la base e' continua, la porta ci si
            // appoggia sopra senza interromperla.
            p.move(to: CGPoint(x: 2.0, y: 20.4))
            p.addLine(to: CGPoint(x: 2.0, y: 7.6))
            p.addLine(to: CGPoint(x: 10.2, y: 2.6))
            p.addQuadCurve(to: CGPoint(x: 13.8, y: 2.6), control: CGPoint(x: 12.0, y: 1.2))
            p.addLine(to: CGPoint(x: 22.0, y: 7.6))
            p.addLine(to: CGPoint(x: 22.0, y: 20.4))
            p.addQuadCurve(to: CGPoint(x: 20.0, y: 22.4), control: CGPoint(x: 22.0, y: 22.4))
            p.addLine(to: CGPoint(x: 4.0, y: 22.4))
            p.addQuadCurve(to: CGPoint(x: 2.0, y: 20.4), control: CGPoint(x: 2.0, y: 22.4))

            // La porta: un rettangolo dagli angoli alti arrotondati, aperto in
            // basso. E' larga sei punti, non due: era l'errore piu' evidente.
            p.move(to: CGPoint(x: 8.4, y: 22.4))
            p.addLine(to: CGPoint(x: 8.4, y: 12.7))
            p.addQuadCurve(to: CGPoint(x: 10.0, y: 11.2), control: CGPoint(x: 8.4, y: 11.2))
            p.addLine(to: CGPoint(x: 13.6, y: 11.2))
            p.addQuadCurve(to: CGPoint(x: 15.2, y: 12.7), control: CGPoint(x: 15.2, y: 11.2))
            p.addLine(to: CGPoint(x: 15.2, y: 22.4))

        case .payments:
            // La banconota dietro spunta a sinistra e in basso.
            p.move(to: CGPoint(x: 1.2, y: 7.2))
            p.addLine(to: CGPoint(x: 1.2, y: 18.6))
            p.addQuadCurve(to: CGPoint(x: 2.6, y: 20.0), control: CGPoint(x: 1.2, y: 20.0))
            p.addLine(to: CGPoint(x: 18.4, y: 20.0))

            // Quella davanti.
            p.addRoundedRect(
                in: CGRect(x: 4.8, y: 3.6, width: 17.2, height: 12.4),
                cornerWidth: 1.6,
                cornerHeight: 1.6
            )

            // La cifra: un ovale stretto al centro.
            p.addEllipse(in: CGRect(x: 11.2, y: 7.6, width: 3.2, height: 4.8))

        case .balances:
            // Il corpo, poi la patta che sale verso destra.
            p.addRoundedRect(
                in: CGRect(x: 1.2, y: 8.0, width: 21.6, height: 14.4),
                cornerWidth: 3.2,
                cornerHeight: 3.2
            )

            p.move(to: CGPoint(x: 1.6, y: 7.4))
            p.addLine(to: CGPoint(x: 16.0, y: 1.8))
            p.addQuadCurve(to: CGPoint(x: 17.6, y: 3.2), control: CGPoint(x: 17.6, y: 2.0))
            p.addLine(to: CGPoint(x: 17.6, y: 8.0))

        case .customers:
            // Cliente davanti, in basso a sinistra.
            p.addEllipse(in: CGRect(x: 4.8, y: 6.4, width: 5.6, height: 5.6))

            // Il corpo e' una cupola chiusa che poggia sulla base, non un
            // archetto aperto: e' la differenza che si notava di piu'.
            p.move(to: CGPoint(x: 2.0, y: 22.0))
            p.addLine(to: CGPoint(x: 2.0, y: 19.5))
            p.addCurve(
                to: CGPoint(x: 7.6, y: 16.0),
                control1: CGPoint(x: 2.0, y: 16.9),
                control2: CGPoint(x: 4.4, y: 16.0)
            )
            p.addCurve(
                to: CGPoint(x: 13.2, y: 19.5),
                control1: CGPoint(x: 10.8, y: 16.0),
                control2: CGPoint(x: 13.2, y: 16.9)
            )
            p.addLine(to: CGPoint(x: 13.2, y: 22.0))
            p.addLine(to: CGPoint(x: 2.0, y: 22.0))

            // Cliente dietro: testa piu' in alto a destra e mezza spalla, che
            // e' una staffa aperta verso sinistra.
            p.addEllipse(in: CGRect(x: 13.2, y: 1.6, width: 5.6, height: 5.6))
            p.move(to: CGPoint(x: 13.2, y: 11.2))
            p.addLine(to: CGPoint(x: 20.4, y: 11.2))
            p.addQuadCurve(to: CGPoint(x: 22.4, y: 13.2), control: CGPoint(x: 22.4, y: 11.2))
            p.addLine(to: CGPoint(x: 22.4, y: 16.4))
            p.addQuadCurve(to: CGPoint(x: 20.4, y: 18.4), control: CGPoint(x: 22.4, y: 18.4))
            p.addLine(to: CGPoint(x: 16.8, y: 18.4))

        case .search:
            p.addEllipse(in: CGRect(x: 2.2, y: 2.2, width: 14.8, height: 14.8))
            p.move(to: CGPoint(x: 15.6, y: 16.4))
            p.addLine(to: CGPoint(x: 22.0, y: 22.0))
        }

        return p
    }

    /// L'unica parte piena: il bottone del portafoglio.
    private static func dot(for tab: Tab) -> CGPath? {
        guard tab == .balances else { return nil }
        let p = CGMutablePath()
        p.addEllipse(in: CGRect(x: 16.8, y: 14.0, width: 2.4, height: 2.4))
        return p
    }
}
