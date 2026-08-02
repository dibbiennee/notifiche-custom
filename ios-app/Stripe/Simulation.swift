import Foundation

/// I pochi numeri che imposti tu. Tutto il resto della dashboard, fino
/// all'ultima cifra del grafico, viene calcolato da qui: cosi' non esistono
/// due valori che possono contraddirsi.
struct Simulation: Codable {
    var merchantName = "Digital Consult LLC"
    var currency = Currency.usd

    /// Quanto entra in un giorno. Ogni giornata pesca un importo a caso in
    /// questo intervallo.
    var dailyMin: Double = 400
    var dailyMax: Double = 800

    /// Gli importi dei singoli pagamenti, gli stessi delle notifiche. La
    /// giornata si riempie sommando questi finche' non arriva al suo totale:
    /// e' anche il motivo per cui il numero di pagamenti torna sempre.
    var paymentAmounts: [Double] = [9.99, 49.99]

    /// Quanto scende il netto rispetto al lordo.
    var netDeductionPercent: Double = 2

    /// Quanti clienti su cento fanno piu' di un acquisto. Alzandolo, i
    /// clienti diventano meno dei pagamenti.
    var repeatCustomerPercent: Double = 0

    /// Da quanti giorni l'attivita' e' aperta: serve solo alla voce ALL.
    var businessDays: Int = 400

    /// Cambiandolo cambiano tutti i numeri, restando dentro gli stessi
    /// intervalli. E' quello che rende la simulazione stabile: senza, i valori
    /// ballerebbero a ogni ridisegno della schermata.
    var seed: UInt64 = 20_260_802

    enum Currency: String, Codable, CaseIterable, Identifiable {
        case usd, eur, gbp, aed

        var id: String { rawValue }

        /// Stripe scrive "US$" nella fascia in alto e "$" nei report. Non e'
        /// una svista nostra: e' cosi' nell'app vera.
        var cardSymbol: String {
            switch self {
            case .usd: return "US$"
            case .eur: return "€"
            case .gbp: return "£"
            case .aed: return "AED "
            }
        }

        var reportSymbol: String {
            switch self {
            case .usd: return "$"
            case .eur: return "€"
            case .gbp: return "£"
            // Il dirham non ha un simbolo che Stripe usi: scrive la sigla.
            case .aed: return "AED "
            }
        }

        var title: String {
            switch self {
            case .usd: return "Dollaro"
            case .eur: return "Euro"
            case .gbp: return "Sterlina"
            case .aed: return "Dirham (AED)"
            }
        }
    }
}

extension Simulation {
    /// Qualche nome gia' pronto, per non doverlo inventare ogni volta. Sono
    /// inventati: non corrispondono ad aziende esistenti.
    static let suggestedNames = [
        "Tech Digital Hub",
        "Northgate Web Studio",
        "Vertex Media Group",
        "Lumen Digital Agency",
        "Ardent Web Consulting",
    ]
}

/// Una giornata: i singoli pagamenti incassati. Tutto il resto sono conti su
/// questa lista.
struct SimulatedDay {
    let payments: [Double]

    var gross: Double { payments.reduce(0, +) }
    var paymentCount: Int { payments.count }
}

// MARK: - Generazione

extension Simulation {
    /// La giornata a `offset` giorni fa: 0 e' oggi, 1 ieri.
    ///
    /// Il risultato dipende solo da seed e offset, mai dall'ordine in cui la
    /// si chiama. Senza questa garanzia gli incassi cambierebbero mentre
    /// scorri, e i totali non tornerebbero mai con il grafico.
    func day(_ offset: Int) -> SimulatedDay {
        let amounts = paymentAmounts.filter { $0 > 0 }.sorted()
        guard let smallest = amounts.first else { return SimulatedDay(payments: []) }

        var rng = SeededRandom(seed &+ UInt64(bitPattern: Int64(offset) &* 7_919))
        let low = min(dailyMin, dailyMax)
        let high = max(dailyMin, dailyMax)
        let target = low + rng.double() * (high - low)

        var payments: [Double] = []
        var sum = 0.0

        // Il tetto sul numero di pagamenti evita che un importo minuscolo con
        // un incasso alto generi decine di migliaia di righe.
        while sum + smallest <= target && payments.count < 2_000 {
            let candidate = amounts[rng.index(amounts.count)]
            let chosen = sum + candidate <= target ? candidate : smallest
            payments.append(chosen)
            sum += chosen
        }

        return SimulatedDay(payments: payments)
    }

    /// I clienti di una giornata: i pagamenti meno quelli che rifanno acquisto.
    func customerCount(_ day: SimulatedDay) -> Int {
        guard day.paymentCount > 0 else { return 0 }
        let repeats = Double(day.paymentCount) * (repeatCustomerPercent / 100)
        return max(1, day.paymentCount - Int(repeats.rounded()))
    }

    func net(_ gross: Double) -> Double {
        gross * (1 - netDeductionPercent / 100)
    }
}

/// Generatore deterministico (SplitMix64). Non usa `Double.random`, che
/// darebbe numeri diversi a ogni chiamata: qui gli stessi ingressi devono
/// dare sempre le stesse cifre.
struct SeededRandom {
    private var state: UInt64

    init(_ seed: UInt64) { state = seed }

    mutating func next() -> UInt64 {
        state = state &+ 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    /// Un numero fra 0 e 1.
    mutating func double() -> Double {
        Double(next() >> 11) / Double(1 << 53)
    }

    /// Un indice valido per una lista di `count` elementi.
    mutating func index(_ count: Int) -> Int {
        count <= 1 ? 0 : min(count - 1, Int(double() * Double(count)))
    }
}
