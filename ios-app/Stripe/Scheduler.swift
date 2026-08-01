import Foundation

/// Gli importi offerti come caselle da spuntare, nella forma richiesta.
let PRESET_AMOUNTS = ["9.99", "49.99", "1890.00", "11900.00", "48900.00"]

/// Nel testo, questo pezzo viene sostituito con la cifra.
let AMOUNT_PLACEHOLDER = "|importo|"

/// Tetto di notifiche per serie.
let MAX_SERIES_LENGTH = 100

enum Limit {
    case count(Int)
    case duration(TimeInterval)
}

enum Cadence {
    case fixed(TimeInterval)
    case random(min: TimeInterval, max: TimeInterval)
}

enum SeriesError: LocalizedError {
    case tooMany(Int)
    case badParameters(String)

    var errorDescription: String? {
        switch self {
        case .tooMany(let n):
            return "Verrebbero \(n) notifiche, il massimo e' \(MAX_SERIES_LENGTH)."
        case .badParameters(let m):
            return m
        }
    }
}

/// Gli istanti della serie, come ritardi in secondi dal momento dell'invio.
/// Il primo e' sempre `startDelay`.
func computeOffsets(
    startDelay: TimeInterval,
    limit: Limit,
    cadence: Cadence,
    rng: @escaping () -> Double = { Double.random(in: 0..<1) }
) throws -> [TimeInterval] {
    guard startDelay >= 0 else {
        throw SeriesError.badParameters("Il ritardo iniziale non puo' essere negativo.")
    }

    let gap: () -> TimeInterval
    switch cadence {
    case .fixed(let s):
        guard s >= 1 else { throw SeriesError.badParameters("La cadenza minima e' 1 secondo.") }
        gap = { s }
    case .random(let lo, let hi):
        guard lo >= 1, lo <= hi else {
            throw SeriesError.badParameters("Intervallo casuale non valido.")
        }
        gap = { (lo + (hi - lo) * rng()).rounded() }
    }

    var offsets: [TimeInterval] = [startDelay]

    switch limit {
    case .count(let n):
        guard n >= 1 else { throw SeriesError.badParameters("Serve almeno una notifica.") }
        guard n <= MAX_SERIES_LENGTH else { throw SeriesError.tooMany(n) }
        while offsets.count < n {
            offsets.append(offsets[offsets.count - 1] + gap())
        }
    case .duration(let window):
        guard window >= 0 else { throw SeriesError.badParameters("La durata non puo' essere negativa.") }
        let end = startDelay + window
        while true {
            let next = offsets[offsets.count - 1] + gap()
            if next > end { break }
            offsets.append(next)
            if offsets.count > MAX_SERIES_LENGTH { throw SeriesError.tooMany(offsets.count) }
        }
    }

    return offsets
}

/// Sostituisce il segnaposto con la cifra. Il simbolo di valuta lo scrive
/// l'utente nel testo: qui si tocca solo il numero.
func renderBody(_ template: String, amount: String) -> String {
    template.replacingOccurrences(of: AMOUNT_PLACEHOLDER, with: amount)
}

func pickAmount(_ amounts: [String], rng: () -> Double = { Double.random(in: 0..<1) }) -> String? {
    guard !amounts.isEmpty else { return nil }
    return amounts[min(amounts.count - 1, Int(rng() * Double(amounts.count)))]
}
