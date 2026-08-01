import SwiftUI

/// I colori letti dallo screenshot di riferimento. Stanno tutti qui perche' la
/// dashboard e' una copia visiva: se un colore e' sbagliato si vede subito, e
/// si corregge in un punto solo.
enum Theme {
    /// Il fondo di tutta l'app. Non e' nero pieno: e' appena piu' chiaro.
    static let background = Color(red: 0.043, green: 0.043, blue: 0.051)

    /// La barra in basso, di mezzo tono sopra il fondo.
    static let bar = Color(red: 0.075, green: 0.075, blue: 0.086)

    static let separator = Color(white: 1, opacity: 0.09)
    static let cardStroke = Color(white: 1, opacity: 0.16)
    static let iconButton = Color(white: 1, opacity: 0.10)

    static let primaryText = Color.white
    static let secondaryText = Color(red: 0.60, green: 0.60, blue: 0.63)

    /// Il viola pieno di Stripe: pillola attiva, tasto +, etichette del periodo
    /// corrente.
    static let accent = Color(red: 0.404, green: 0.357, blue: 1.0)

    /// La stessa famiglia ma schiarita: la spezzata del periodo corrente e i
    /// totali corrispondenti.
    static let accentLight = Color(red: 0.549, green: 0.518, blue: 0.961)

    /// La spezzata del periodo precedente, volutamente in secondo piano, e la
    /// sua etichetta, un tono piu' chiara per restare leggibile.
    static let mutedLine = Color(white: 0.32)
    static let badgeGrey = Color(white: 0.38)
    static let gridLine = Color(white: 1, opacity: 0.07)

    static let negativeText = Color(red: 0.96, green: 0.45, blue: 0.49)
    static let negativeFill = Color(red: 0.29, green: 0.09, blue: 0.13)
    static let positiveText = Color(red: 0.42, green: 0.85, blue: 0.56)
    static let positiveFill = Color(red: 0.08, green: 0.24, blue: 0.14)
}

/// Il margine laterale del contenuto, uguale ovunque.
let SCREEN_INSET: CGFloat = 18
