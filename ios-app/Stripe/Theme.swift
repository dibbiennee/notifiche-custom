import SwiftUI
import UIKit

/// I colori del tema scuro sono campionati dallo screenshot di riferimento e
/// convertiti da Display P3 a sRGB. Quelli chiari sono letti dallo screenshot
/// in tema chiaro e vanno ancora verificati al pixel.
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
    static let separator = adaptive(light: rgb(223, 227, 232), dark: rgb(43, 48, 57))
    static let cardStroke = separator
    static let mutedLine = adaptive(light: rgb(214, 218, 224), dark: rgb(43, 48, 57))

    /// Le verticali del grafico, appena staccate dallo sfondo.
    static let gridLine = adaptive(light: rgb(240, 242, 245), dark: rgb(31, 35, 43))

    /// Nello scuro non è bianco puro ma appena azzurrato; nel chiaro è quasi
    /// nero. Vale anche per le etichette della fascia, che sembrano grigie solo
    /// perché sono piccole.
    static let primaryText = adaptive(light: rgb(26, 28, 33), dark: rgb(201, 206, 216))

    /// Date, totale del periodo precedente, periodi non selezionati.
    static let secondaryText = adaptive(light: rgb(107, 114, 128), dark: rgb(139, 153, 173))

    /// Le voci spente della barra in basso.
    static let tabInactive = adaptive(light: rgb(107, 114, 128), dark: rgb(169, 178, 193))

    static let iconButton = adaptive(light: rgb(240, 242, 245), dark: rgb(75, 82, 95))

    /// Il viola pieno: pillola attiva, tasto +, voce attiva della barra.
    static let accent = adaptive(light: rgb(99, 91, 255), dark: rgb(121, 105, 252))

    /// Più chiaro: spezzata corrente, totale corrente, "Edit".
    static let accentLight = adaptive(light: rgb(99, 91, 255), dark: rgb(145, 137, 254))

    /// L'etichetta del periodo precedente sul grafico.
    static let badgeGrey = adaptive(light: rgb(107, 114, 128), dark: rgb(149, 158, 171))

    static let negativeText = adaptive(light: rgb(179, 9, 60), dark: rgb(244, 107, 125))
    static let negativeFill = adaptive(light: rgb(253, 226, 233), dark: rgb(66, 3, 32))

    static let positiveText = adaptive(light: rgb(11, 122, 69), dark: rgb(94, 224, 143))
    static let positiveFill = adaptive(light: rgb(215, 247, 224), dark: rgb(6, 56, 30))
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
