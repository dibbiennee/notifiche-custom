import SwiftUI

/// La rotella di Stripe: un anello sottile che gira, sfumato da pieno a
/// trasparente lungo il giro.
///
/// Non è quella di sistema. `ProgressView` disegna i raggi di iOS, una corona
/// di trattini, che è una forma completamente diversa: messa accanto
/// all'originale si riconosce al primo sguardo.
///
/// Le misure vengono dallo screenshot: diametro 18pt, tratto 2pt, colore pieno
/// (129,141,159) che sfuma fino a sparire in circa un terzo di giro.
struct StripeSpinner: View {
    var diameter: CGFloat = 18
    var lineWidth: CGFloat = 2

    @State private var spinning = false

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.92)
            .stroke(
                AngularGradient(
                    stops: [
                        .init(color: Theme.spinner.opacity(0), location: 0),
                        .init(color: Theme.spinner.opacity(0.35), location: 0.35),
                        .init(color: Theme.spinner, location: 0.85),
                        .init(color: Theme.spinner, location: 1),
                    ],
                    center: .center
                ),
                style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
            )
            .frame(width: diameter, height: diameter)
            .rotationEffect(.degrees(spinning ? 360 : 0))
            .animation(
                .linear(duration: 0.9).repeatForever(autoreverses: false),
                value: spinning
            )
            .onAppear { spinning = true }
    }
}
