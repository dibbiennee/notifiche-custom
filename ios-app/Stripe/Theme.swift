import SwiftUI

/// I colori non sono stimati a occhio: sono campionati dallo screenshot di
/// riferimento e convertiti da Display P3 a sRGB, che e' lo spazio in cui
/// SwiftUI interpreta questi valori. Senza la conversione i viola uscivano
/// slavati e lo sfondo troppo scuro.
enum Theme {
    private static func rgb(_ r: Int, _ g: Int, _ b: Int) -> Color {
        Color(red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255)
    }

    /// Non e' nero: e' un grigio bluastro. E' la differenza che si nota di
    /// piu' mettendo le due schermate una sopra l'altra.
    static let background = rgb(21, 23, 30)

    /// La barra in basso ha lo stesso colore dello sfondo: la separa solo la
    /// riga sottile in cima.
    static let bar = background

    /// Bordo della card, separatori e spezzata del periodo precedente sono
    /// tutti lo stesso identico colore.
    static let separator = rgb(43, 48, 57)
    static let cardStroke = separator
    static let mutedLine = separator

    /// Le verticali del grafico, appena staccate dallo sfondo.
    static let gridLine = rgb(31, 35, 43)

    /// Non bianco puro: un bianco appena azzurrato. Vale anche per le
    /// etichette della fascia, che sembrano grigie solo perche' sono piccole.
    static let primaryText = rgb(201, 206, 216)

    /// Date, totale del periodo precedente, periodi non selezionati.
    static let secondaryText = rgb(139, 153, 173)

    /// Le voci spente della barra in basso sono un gradino piu' chiare del
    /// testo secondario.
    static let tabInactive = rgb(169, 178, 193)

    /// Il fondo del tasto col negozio: piu' chiaro di quanto sembri.
    static let iconButton = rgb(75, 82, 95)

    /// Il viola pieno: pillola attiva, tasto +, voce attiva della barra.
    static let accent = rgb(121, 105, 252)

    /// Piu' chiaro: spezzata corrente, totale corrente, "Edit".
    static let accentLight = rgb(145, 137, 254)

    /// L'etichetta del periodo precedente sul grafico.
    static let badgeGrey = rgb(149, 158, 171)

    static let negativeText = rgb(244, 107, 125)
    static let negativeFill = rgb(66, 3, 32)

    /// Il verde non compare nello screenshot di riferimento: e' costruito per
    /// analogia con il rosso, stessa distanza dallo sfondo.
    static let positiveText = rgb(94, 224, 143)
    static let positiveFill = rgb(6, 56, 30)
}

/// Il margine laterale del contenuto, uguale ovunque.
let SCREEN_INSET: CGFloat = 16

/// Una riga spessa un pixel fisico, non un punto: i separatori di Stripe sono
/// cosi', e a un punto pieno si vedono tre volte piu' spessi.
struct Hairline: View {
    @Environment(\.displayScale) private var scale

    var body: some View {
        Rectangle()
            .fill(Theme.separator)
            .frame(height: 1 / scale)
    }
}
