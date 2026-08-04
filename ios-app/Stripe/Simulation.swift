import Foundation

/// I pochi numeri che imposti tu. Tutto il resto della dashboard, fino
/// all'ultima cifra del grafico, viene calcolato da qui: cosi' non esistono
/// due valori che possono contraddirsi.
struct Simulation: Codable, Equatable {
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

    /// Che quota di clienti, ogni giorno, prende anche il prodotto piu' caro
    /// dopo quello base. Non e' un numero fisso: ogni giornata pesca il suo in
    /// questo intervallo, altrimenti pagamenti e clienti resterebbero sempre
    /// nella stessa proporzione e si vedrebbe che sono inventati.
    ///
    /// Opzionali per non rompere i salvataggi fatti prima.
    var repeatMinPercent: Double?
    var repeatMaxPercent: Double?

    var upsellRange: (low: Double, high: Double) {
        let low = repeatMinPercent ?? 40
        let high = repeatMaxPercent ?? 80
        return (min(low, high), max(low, high))
    }

    /// Incassi fissati a mano, per data di calendario (`AAAA-MM-GG`). La
    /// chiave e' la data e non "quanti giorni fa" proprio perche' quello che
    /// fissi oggi deve restare su oggi anche domani. Il totale esatto dipende
    /// dai tagli disponibili: la giornata si riempie finche' ci sta, quindi
    /// arriva appena sotto.
    var dayTargets: [String: Double]?

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
            case .usd: return "Dollar"
            case .eur: return "Euro"
            case .gbp: return "Pound"
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
    let offset: Int
    let payments: [Double]

    /// Quanti compratori distinti. Meno dei pagamenti, perche' chi fa upsell
    /// paga due volte.
    let customers: Int

    var gross: Double { payments.reduce(0, +) }
    var paymentCount: Int { payments.count }
}

// MARK: - Date

extension Simulation {
    /// Giorni dal 1970-01-01 alla data di calendario. E' l'algoritmo civile di
    /// Hinnant: solo interi, nessun fuso orario di mezzo, cosi' Swift e
    /// TypeScript danno per forza lo stesso numero.
    static func daysFromCivil(_ y: Int, _ m: Int, _ d: Int) -> Int {
        let anno = y - (m <= 2 ? 1 : 0)
        let era = Int(floor(Double(anno) / 400))
        let yoe = anno - era * 400
        let doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    /// La data di `offset` giorni fa, secondo il calendario locale.
    static func date(at offset: Int, now: Date = Date()) -> Date {
        let cal = Calendar.current
        return cal.date(byAdding: .day, value: -offset, to: cal.startOfDay(for: now)) ?? now
    }

    /// La chiave con cui si fissa un incasso: `AAAA-MM-GG`.
    static func dateKey(_ date: Date) -> String {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// Il numero di giorno assoluto usato come seme. Prima si usava `offset`,
    /// cioe' quanti giorni fa: a mezzanotte ogni giornata scivolava di un posto
    /// e tutto lo storico si rigenerava. Legandolo alla data, una giornata vale
    /// sempre lo stesso importo.
    static func epochDay(_ offset: Int, now: Date = Date()) -> Int {
        let c = Calendar.current.dateComponents([.year, .month, .day], from: date(at: offset, now: now))
        return daysFromCivil(c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }
}

// MARK: - Generazione

extension Simulation {
    /// La giornata a `offset` giorni fa: 0 e' oggi, 1 ieri.
    ///
    /// Il risultato dipende da seed e data, mai dall'ordine in cui la si
    /// chiama: domani questa stessa giornata varra' ancora quanto vale adesso. Senza questa garanzia gli incassi cambierebbero mentre
    /// scorri, e i totali non tornerebbero mai con il grafico.
    /// La giornata si costruisce per clienti, non per pagamenti sciolti: ognuno
    /// prende il prodotto base, e una parte aggiunge quello piu' caro. E' un
    /// upsell, non un riacquisto dello stesso taglio, ed e' il motivo per cui i
    /// pagamenti sono sempre piu' dei clienti.
    func day(_ offset: Int) -> SimulatedDay {
        let amounts = paymentAmounts.filter { $0 > 0 }.sorted()
        guard let base = amounts.first else {
            return SimulatedDay(offset: offset, payments: [], customers: 0)
        }
        let upsells = Array(amounts.dropFirst())

        let giorno = Simulation.epochDay(offset)
        var rng = SeededRandom(seed &+ UInt64(bitPattern: Int64(giorno) &* 7_919))
        let low = min(dailyMin, dailyMax)
        let high = max(dailyMin, dailyMax)

        // Ogni blocco di trenta giorni ha un suo livello medio, e la giornata
        // oscilla intorno a quello. Pescando ogni giorno in modo indipendente
        // il grafico veniva una linea piatta: mesi buoni e mesi scarsi sono
        // quello che dà alla curva la forma che ha nell'originale. Il valore
        // resta comunque dentro l'intervallo impostato.
        let block = Int(floor(Double(giorno) / 30))
        var blockRng = SeededRandom(seed &+ UInt64(bitPattern: Int64(block) &* 2_654_435_761))
        let centre = 0.25 + 0.5 * blockRng.double()
        let spread = (rng.double() - 0.5) * 0.4

        // Le estrazioni sopra avvengono comunque, anche quando oggi e' fissato:
        // saltarle sposterebbe tutto il flusso del generatore e cambierebbe le
        // giornate successive.
        let casuale = low + min(1, max(0, centre + spread)) * (high - low)
        let fissato = dayTargets?[Simulation.dateKey(Simulation.date(at: offset))]
        let target = (fissato ?? 0) > 0 ? fissato! : casuale

        // La quota di upsell del giorno, dal suo generatore: cosi' il flusso
        // principale resta identico fra Swift e TypeScript.
        var upsellRng = SeededRandom(seed &+ UInt64(bitPattern: Int64(giorno) &* 15_485_863))
        let range = upsellRange
        let quota = range.low + upsellRng.double() * (range.high - range.low)

        var payments: [Double] = []
        var customers = 0
        var sum = 0.0

        // Il tetto evita che un importo minuscolo con un incasso alto generi
        // decine di migliaia di righe.
        while sum + base <= target && payments.count < 2_000 {
            payments.append(base)
            sum += base
            customers += 1

            guard !upsells.isEmpty, rng.double() * 100 < quota else { continue }
            let extra = upsells[rng.index(upsells.count)]
            if sum + extra <= target {
                payments.append(extra)
                sum += extra
            }
        }

        return SimulatedDay(offset: offset, payments: payments, customers: customers)
    }

    func customerCount(_ day: SimulatedDay) -> Int { day.customers }

    /// Quanto e' entrato dall'inizio della giornata fino a `upToHour`, ora per
    /// ora. I pagamenti si distribuiscono fra le 6 e le 23, con piu' peso nel
    /// pomeriggio. Deve restare identica a `cumulativeByHour` in
    /// `src/lib/simulation.ts`: la cifra in alto viene da qui.
    func cumulativeByHour(_ offset: Int, upToHour: Int) -> [Double] {
        let d = day(offset)
        var rng = SeededRandom(seed &+ UInt64(bitPattern: Int64(Simulation.epochDay(offset)) &* 104_729))

        var hours = [Double](repeating: 0, count: 24)
        for amount in d.payments {
            let hour = min(23, Int(6 + rng.double() * 18))
            hours[hour] += amount
        }

        var out: [Double] = []
        var running = 0.0
        for hour in 0...min(23, max(0, upToHour)) {
            running += hours[hour]
            out.append(running)
        }
        return out
    }

    /// Quanto e' entrato finora oggi: l'ultimo punto della curva delle ore.
    func grossSoFar(now: Date = Date(), calendar: Calendar = .current) -> Double {
        cumulativeByHour(0, upToHour: calendar.component(.hour, from: now)).last ?? 0
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
