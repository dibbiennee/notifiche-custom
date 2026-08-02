import SwiftUI
import UIKit

/// Tutti i colori, chiari e scuri, sono campionati dagli screenshot in
/// screenshot-dashboard/ e convertiti da Display P3 a sRGB. L'unica eccezione
/// è la pastiglia rossa nel tema chiaro: negli screenshot compare solo quella
/// verde, quindi è costruita per analogia.
///
/// Ogni colore è dichiarato nelle due versioni e sceglie da solo: l'app segue
/// l'impostazione del telefono, non ne impone una.
enum Theme {
    private static func rgb(_ r: Int, _ g: Int, _ b: Int) -> UIColor {
        UIColor(red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, alpha: 1)
    }

    private static func adaptive(light: UIColor, dark: UIColor) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark ? dark : light
        })
    }

    /// Nello scuro non è nero ma un grigio bluastro; nel chiaro è bianco pieno.
    static let background = adaptive(light: rgb(255, 255, 255), dark: rgb(21, 23, 30))

    /// La barra in basso ha lo stesso colore dello sfondo: la separa solo la
    /// riga sottile in cima.
    static let bar = background

    /// Bordo della card, separatori e spezzata del periodo precedente sono
    /// tutti lo stesso identico colore.
    static let separator = adaptive(light: rgb(216, 221, 228), dark: rgb(43, 48, 57))
    static let cardStroke = separator
    static let mutedLine = adaptive(light: rgb(216, 221, 228), dark: rgb(43, 48, 57))

    /// Le verticali del grafico, appena staccate dallo sfondo.
    static let gridLine = adaptive(light: rgb(216, 221, 228), dark: rgb(31, 35, 43))

    /// Nello scuro non è bianco puro ma appena azzurrato; nel chiaro è quasi
    /// nero. Vale anche per le etichette della fascia, che sembrano grigie solo
    /// perché sono piccole.
    static let primaryText = adaptive(light: rgb(53, 58, 68), dark: rgb(201, 206, 216))

    /// Date, totale del periodo precedente, periodi non selezionati.
    static let secondaryText = adaptive(light: rgb(88, 97, 112), dark: rgb(139, 153, 173))

    /// Le voci spente della barra in basso.
    static let tabInactive = adaptive(light: rgb(71, 78, 90), dark: rgb(169, 178, 193))

    static let iconButton = adaptive(light: rgb(245, 246, 247), dark: rgb(75, 82, 95))

    /// Il viola pieno: pillola attiva, tasto +, voce attiva della barra.
    static let accent = adaptive(light: rgb(103, 93, 254), dark: rgb(121, 105, 252))

    /// Spezzata corrente, totale corrente, "Edit". Nel tema chiaro è più
    /// carico della pillola, non più chiaro: è così nell'originale.
    static let accentLight = adaptive(light: rgb(83, 58, 253), dark: rgb(145, 137, 254))

    /// L'anello che gira mentre ricarica. Nel tema scuro non compare in
    /// nessuno screenshot: e' costruito per analogia col testo secondario.
    static let spinner = adaptive(light: rgb(129, 141, 159), dark: rgb(139, 153, 173))

    /// L'etichetta del periodo precedente sul grafico.
    static let badgeGrey = adaptive(light: rgb(108, 117, 136), dark: rgb(149, 158, 171))

    static let negativeText = adaptive(light: rgb(179, 9, 60), dark: rgb(244, 107, 125))
    static let negativeFill = adaptive(light: rgb(254, 226, 233), dark: rgb(66, 3, 32))

    static let positiveText = adaptive(light: rgb(33, 112, 4), dark: rgb(94, 224, 143))
    static let positiveFill = adaptive(light: rgb(209, 249, 179), dark: rgb(6, 56, 30))
}

/// Il margine laterale del contenuto, uguale ovunque.
let SCREEN_INSET: CGFloat = 16

/// Una riga spessa un pixel fisico, non un punto: i separatori di Stripe sono
/// così, e a un punto pieno si vedono tre volte più spessi.
struct Hairline: View {
    @Environment(\.displayScale) private var scale

    var body: some View {
        Rectangle()
            .fill(Theme.separator)
            .frame(height: 1 / scale)
    }
}
