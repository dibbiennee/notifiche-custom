import Foundation

/// Una cifra della fascia in alto: valore gia' formattato, perche' la fascia
/// mostra sia importi che conteggi.
struct StatItem: Identifiable {
    let id = UUID()
    var label: String
    var value: String
}

/// Una schermata della fascia scorrevole.
struct StatPage: Identifiable {
    let id = UUID()
    var items: [StatItem]
}

/// Un riquadro di "Reports overview". Non ha piu' campi da riempire a mano:
/// arriva gia' calcolato dalla simulazione.
struct Report: Identifiable {
    let id = UUID()
    var title: String
    var previousTotal: Double
    var currentTotal: Double
    var previousRange: String
    var currentRange: String
    var previousSeries: [Double]
    var currentSeries: [Double]
    var symbol: String

    /// La variazione fra i due periodi. Nulla se il precedente e' a zero: non
    /// ci sarebbe niente da rapportare e la pastiglia non compare.
    var delta: Double? {
        guard previousTotal != 0 else { return nil }
        return (currentTotal - previousTotal) / previousTotal * 100
    }
}

/// I periodi della barretta sotto "Reports overview".
enum Period: String, CaseIterable, Identifiable {
    case week = "1W"
    case fourWeeks = "4W"
    case year = "1Y"
    case monthToDate = "MTD"
    case quarterToDate = "QTD"
    case yearToDate = "YTD"
    case all = "ALL"

    var id: String { rawValue }

    /// Quanti giorni copre, contando oggi. MTD, QTD e YTD dipendono da che
    /// giorno e' oggi, quindi cambiano da soli col passare del tempo.
    func dayCount(today: Date, calendar: Calendar, businessDays: Int) -> Int {
        switch self {
        case .week: return 7
        case .fourWeeks: return 28
        case .year: return 365
        case .monthToDate:
            return calendar.component(.day, from: today)
        case .quarterToDate:
            let month = calendar.component(.month, from: today)
            let quarterStartMonth = ((month - 1) / 3) * 3 + 1
            var parts = calendar.dateComponents([.year], from: today)
            parts.month = quarterStartMonth
            parts.day = 1
            guard let start = calendar.date(from: parts),
                  let days = calendar.dateComponents([.day], from: start, to: today).day
            else { return 90 }
            return days + 1
        case .yearToDate:
            return calendar.ordinality(of: .day, in: .year, for: today) ?? 1
        case .all:
            return max(2, businessDays)
        }
    }
}

/// Tutto quello che la schermata mostra, gia' pronto. Si costruisce dalla
/// simulazione e dal periodo scelto: non contiene niente che si possa
/// modificare per conto suo.
struct Dashboard {
    var merchantName: String
    var pages: [StatPage]
    var reports: [Report]
}

extension Dashboard {
    init(simulation: Simulation, period: Period, today: Date = Date(), calendar: Calendar = .current) {
        let days = period.dayCount(today: today, calendar: calendar, businessDays: simulation.businessSpan(now: today))

        // Il periodo corrente arriva a oggi; quello precedente e' lungo uguale
        // e finisce il giorno prima che cominci il corrente.
        let current = (0..<days).map { simulation.day($0) }
        let previous = (days..<(days * 2)).map { simulation.day($0) }

        // Gli offset crescono andando indietro nel tempo: per il grafico
        // servono in ordine di lettura, dal piu' vecchio a oggi.
        let currentDaily = current.map(\.gross).reversed().map { $0 }
        let previousDaily = previous.map(\.gross).reversed().map { $0 }

        let grossCurrent = currentDaily.reduce(0, +)
        let grossPrevious = previousDaily.reduce(0, +)

        // La fascia in alto racconta il momento presente, non la giornata
        // intera: l'incasso, i pagamenti e i clienti sono tutti e tre quelli
        // gia' arrivati. Mescolarli dava zero euro con cinque pagamenti.
        let oggi = simulation.today(now: today, calendar: calendar)
        let finora = oggi.gross
        let symbol = simulation.currency.reportSymbol
        let cardSymbol = simulation.currency.cardSymbol

        merchantName = simulation.merchantName

        pages = [
            StatPage(items: [
                StatItem(label: "Gross volume", value: money(finora, symbol: cardSymbol)),
                StatItem(label: "Payments", value: String(oggi.paymentCount)),
                StatItem(label: "Customers", value: String(simulation.customerCount(oggi))),
            ]),
            StatPage(items: [
                StatItem(label: "Net volume", value: money(simulation.net(finora), symbol: cardSymbol)),
                StatItem(label: "Refunds", value: "0"),
                StatItem(label: "Disputes", value: "0"),
            ]),
        ]

        let previousLabel = Self.rangeLabel(
            from: days * 2 - 1, to: days, today: today, calendar: calendar, endsToday: false
        )
        let currentLabel = Self.rangeLabel(
            from: days - 1, to: 0, today: today, calendar: calendar, endsToday: true
        )

        reports = [
            Report(
                title: "Gross volume",
                previousTotal: grossPrevious,
                currentTotal: grossCurrent,
                previousRange: previousLabel,
                currentRange: currentLabel,
                previousSeries: Self.series(previousDaily),
                currentSeries: Self.series(currentDaily),
                symbol: symbol
            ),
            Report(
                title: "Net volume from sales",
                previousTotal: simulation.net(grossPrevious),
                currentTotal: simulation.net(grossCurrent),
                previousRange: previousLabel,
                currentRange: currentLabel,
                previousSeries: Self.series(previousDaily).map(simulation.net),
                currentSeries: Self.series(currentDaily).map(simulation.net),
                symbol: symbol
            ),
        ]
    }

    /// I punti del grafico. Fino a due settimane e' un punto per giorno, come
    /// nell'originale; sui periodi lunghi i giorni si sommano a gruppi, perche'
    /// trecento punti in trecento pixel non si leggerebbero.
    private static func series(_ daily: [Double], maxPoints: Int = 14) -> [Double] {
        guard daily.count > maxPoints else { return daily }

        // I gruppi si contano partendo da oggi e andando indietro: se il resto
        // finisse in fondo, l'ultimo gruppo avrebbe meno giorni degli altri e
        // la spezzata crollerebbe a picco sull'ultimo punto senza che sia
        // successo niente. Il resto sta all'inizio, dove un valore più basso è
        // plausibile.
        let bucket = Int((Double(daily.count) / Double(maxPoints)).rounded(.up))
        let remainder = daily.count % bucket

        var out: [Double] = []
        var start = remainder

        // Un avanzo troppo corto si unisce al gruppo dopo invece di fare punto
        // a sé.
        if remainder > 0 && Double(remainder) >= Double(bucket) / 2 {
            out.append(daily[0..<remainder].reduce(0, +))
        }

        while start < daily.count {
            out.append(daily[start..<min(start + bucket, daily.count)].reduce(0, +))
            start += bucket
        }
        return out
    }

    /// "19 Jul – 25 Jul 2026" per il periodo passato, "26 Jul – Today" per
    /// quello in corso.
    private static func rangeLabel(
        from startOffset: Int, to endOffset: Int, today: Date, calendar: Calendar, endsToday: Bool
    ) -> String {
        guard let start = calendar.date(byAdding: .day, value: -startOffset, to: today),
              let end = calendar.date(byAdding: .day, value: -endOffset, to: today)
        else { return "" }

        if endsToday {
            return "\(shortDate.string(from: start)) – Today"
        }
        return "\(shortDate.string(from: start)) – \(longDate.string(from: end))"
    }
}

private let shortDate: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "d MMM"
    return f
}()

private let longDate: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "d MMM yyyy"
    return f
}()

/// Formato americano a prescindere dalla lingua del telefono: la dashboard di
/// Stripe scrive 1,234.56 anche su un iPhone italiano, e la virgola al posto
/// del punto sarebbe la prima cosa a tradire la copia.
private let amountFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    f.locale = Locale(identifier: "en_US_POSIX")
    f.groupingSeparator = ","
    f.usesGroupingSeparator = true
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    return f
}()

func money(_ value: Double, symbol: String = "$") -> String {
    symbol + (amountFormatter.string(from: value as NSNumber) ?? "0.00")
}

/// La percentuale della pastiglia: segno sempre esplicito, un decimale.
func percent(_ value: Double) -> String {
    String(format: "%@%.1f%%", value < 0 ? "-" : "+", abs(value))
}

/// Un numero come si scrive dentro un campo di testo: niente simboli, e i
/// decimali solo se ci sono davvero.
func decimalText(_ value: Double) -> String {
    value == value.rounded() ? String(Int(value)) : String(format: "%.2f", value)
}

/// Legge quello che l'utente ha battuto. La virgola vale come il punto: sulla
/// tastiera numerica italiana e' quella che si trova.
func parseDecimal(_ text: String) -> Double? {
    let cleaned = text
        .trimmingCharacters(in: .whitespaces)
        .replacingOccurrences(of: ",", with: ".")
    return cleaned.isEmpty ? 0 : Double(cleaned)
}
