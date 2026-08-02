import Foundation

/// Una cifra della fascia in alto. Il valore e' gia' testo: la fascia mostra
/// sia importi che conteggi, e non ha senso costringerli allo stesso formato.
struct StatItem: Identifiable, Codable {
    var id = UUID()
    var label: String
    var value: String
}

/// Una schermata della fascia scorrevole: tre cifre affiancate.
struct StatPage: Identifiable, Codable {
    var id = UUID()
    var items: [StatItem]
}

/// Un riquadro di "Reports overview": due periodi a confronto, ognuno con il
/// suo totale, il suo intervallo di date e la sua spezzata.
struct Report: Identifiable, Codable {
    var id = UUID()
    var title: String
    var previousTotal: Double
    var currentTotal: Double
    var previousRange: String
    var currentRange: String
    var previousSeries: [Double]
    var currentSeries: [Double]

    /// Se valorizzato, questo report non si scrive a mano: e' un altro report
    /// meno una percentuale. Si modifica solo la sorgente, e questo segue.
    var derivedFrom: UUID?

    /// La percentuale tolta alla sorgente. Opzionale per non rompere i
    /// salvataggi fatti prima che questa funzione esistesse.
    var deduction: Double?

    var deductionPercent: Double {
        get { deduction ?? 2 }
        set { deduction = newValue }
    }

    /// La variazione fra i due periodi, in percentuale. Nulla se il periodo
    /// precedente e' a zero: non ci sarebbe niente da rapportare, e la
    /// pastiglia in alto a destra semplicemente non compare.
    var delta: Double? {
        guard previousTotal != 0 else { return nil }
        return (currentTotal - previousTotal) / previousTotal * 100
    }
}

/// Tutto quello che la dashboard mostra. E' una struttura di soli valori: il
/// form ci scrive sopra, `DashboardStore` la salva, le viste la leggono.
struct DashboardData: Codable {
    var merchantName: String
    var todayTitle: String
    var pages: [StatPage]
    var ranges: [String]
    var selectedRange: String
    var reports: [Report]

    /// I report come vanno mostrati: quelli derivati con i numeri gia'
    /// ricalcolati dalla loro sorgente. La derivazione si applica qui, in
    /// lettura, e non riscrivendo i dati: cosi' la sorgente resta l'unica
    /// versione vera e non c'e' modo che le due copie divergano.
    var resolvedReports: [Report] {
        reports.map(resolved)
    }

    func resolved(_ report: Report) -> Report {
        guard let sourceID = report.derivedFrom,
              let source = reports.first(where: { $0.id == sourceID })
        else { return report }

        let factor = 1 - report.deductionPercent / 100
        var out = report
        out.previousTotal = source.previousTotal * factor
        out.currentTotal = source.currentTotal * factor
        out.previousSeries = source.previousSeries.map { $0 * factor }
        out.currentSeries = source.currentSeries.map { $0 * factor }
        out.previousRange = source.previousRange
        out.currentRange = source.currentRange
        return out
    }

    func sourceTitle(for report: Report) -> String? {
        guard let sourceID = report.derivedFrom else { return nil }
        return reports.first(where: { $0.id == sourceID })?.title
    }
}

extension DashboardData {
    /// I numeri dello screenshot di riferimento. Il secondo report non ha
    /// numeri suoi: e' il primo meno il 2%.
    static let mock: DashboardData = {
        let gross = Report(
            title: "Gross volume",
            previousTotal: 22.80,
            currentTotal: 17.19,
            previousRange: "19 Jul – 25 Jul 2026",
            currentRange: "26 Jul – Today",
            previousSeries: [11.43, 5.72, 0, 0, 11.43, 0, 0],
            currentSeries: [0, 0, 0, 5.73, 0, 11.46, 0]
        )

        var net = Report(
            title: "Net volume from sales",
            previousTotal: 0,
            currentTotal: 0,
            previousRange: "",
            currentRange: "",
            previousSeries: [],
            currentSeries: []
        )
        net.derivedFrom = gross.id
        net.deductionPercent = 2

        return DashboardData(
            merchantName: "Elite Web Consult",
            todayTitle: "Today",
            pages: [
                StatPage(items: [
                    StatItem(label: "Gross volume", value: "US$0.00"),
                    StatItem(label: "Payments", value: "0"),
                    StatItem(label: "Customers", value: "0"),
                ]),
                StatPage(items: [
                    StatItem(label: "Net volume", value: "US$0.00"),
                    StatItem(label: "Refunds", value: "0"),
                    StatItem(label: "Disputes", value: "0"),
                ]),
            ],
            ranges: ["1W", "4W", "1Y", "MTD", "QTD", "YTD", "ALL"],
            selectedRange: "1W",
            reports: [gross, net]
        )
    }()
}

/// Formato americano a prescindere dalla lingua del telefono: la dashboard di
/// Stripe scrive 1,234.56 anche su un iPhone italiano, e il punto al posto
/// della virgola e' la prima cosa che tradirebbe la copia.
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

/// Un importo come lo scrive Stripe nei report: simbolo attaccato, due
/// decimali, migliaia separate.
func money(_ value: Double, symbol: String = "$") -> String {
    symbol + (amountFormatter.string(from: value as NSNumber) ?? "0.00")
}

/// La percentuale della pastiglia: segno sempre esplicito, un decimale.
func percent(_ value: Double) -> String {
    String(format: "%@%.1f%%", value < 0 ? "-" : "+", abs(value))
}

/// Un numero come si scrive dentro un campo di testo: niente simboli, niente
/// separatore di migliaia, e i decimali solo se ci sono davvero.
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

extension StatPage {
    static func empty() -> StatPage {
        StatPage(items: [
            StatItem(label: "Gross volume", value: "US$0.00"),
            StatItem(label: "Payments", value: "0"),
            StatItem(label: "Customers", value: "0"),
        ])
    }
}

extension Report {
    static func empty() -> Report {
        Report(
            title: "Nuovo report",
            previousTotal: 0,
            currentTotal: 0,
            previousRange: "Periodo precedente",
            currentRange: "Periodo corrente",
            previousSeries: Array(repeating: 0, count: 7),
            currentSeries: Array(repeating: 0, count: 7)
        )
    }

    /// Allunga o accorcia entrambe le serie insieme: condividono l'asse
    /// orizzontale, con lunghezze diverse il grafico non avrebbe senso.
    mutating func resize(to count: Int) {
        let n = max(2, count)
        func fit(_ series: [Double]) -> [Double] {
            series.count >= n
                ? Array(series.prefix(n))
                : series + Array(repeating: 0, count: n - series.count)
        }
        previousSeries = fit(previousSeries)
        currentSeries = fit(currentSeries)
    }
}
