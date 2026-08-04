import Foundation
import UserNotifications

/// Le notifiche che si armano da sole, senza che tu prema niente.
///
/// Non sono inventate: sono i pagamenti della dashboard. Il generatore assegna
/// gia' a ogni pagamento la sua ora — sono quelle che disegnano la curva di
/// Today — quindi la notifica arriva nel momento in cui il grafico sale, con
/// l'importo che sta in quel punto. Se apri l'app dopo aver sentito il suono,
/// i conti tornano.
///
/// Il limite che comanda tutto e' iOS: tiene al massimo 64 notifiche locali in
/// coda per app, e oltre quelle le scarta in silenzio. Con trenta o novanta
/// pagamenti al giorno non ci starebbe nemmeno una giornata, quindi se ne
/// prende un campione distribuito sulle ore.
struct AutoNotificationSettings: Codable, Equatable {
    var enabled = false

    /// Quante al giorno, al massimo. Il resto dei pagamenti resta nella
    /// dashboard ma non suona.
    var perDay = 12

    /// Quanti giorni avanti armare. Piu' giorni significa restare coperti se
    /// non apri l'app, ma consumano lo stesso budget di 64.
    var daysAhead = 3

    /// Il testo, con `|importo|` al posto della cifra: lo stesso segnaposto
    /// degli invii a mano.
    var template = "You received a payment of $\(AMOUNT_PLACEHOLDER)"

    /// Quante ne verrebbero in tutto, con queste impostazioni.
    var budget: Int { perDay * daysAhead }
}

enum AutoNotifications {
    /// Le nostre si riconoscono dal prefisso: cosi' si possono cancellare
    /// senza toccare quelle mandate a mano dal pannello.
    private static let prefix = "auto-"

    /// Lascia respiro alle serie manuali: se riempissimo tutti i 64, un invio
    /// a mano non partirebbe piu'.
    private static let cap = 56

    /// Rifa' la coda da zero: toglie le nostre e riprogramma i pagamenti
    /// futuri. Va chiamata a ogni avvio e a ogni aggiornamento — e' idempotente,
    /// chiamarla due volte di fila non raddoppia niente.
    static func rearm(
        simulation: Simulation,
        settings: AutoNotificationSettings,
        now: Date = Date(),
        calendar: Calendar = .current,
        center: UNUserNotificationCenter = .current()
    ) async {
        let vecchie = await center.pendingNotificationRequests()
            .map(\.identifier)
            .filter { $0.hasPrefix(prefix) }
        center.removePendingNotificationRequests(withIdentifiers: vecchie)

        guard settings.enabled else { return }

        for (indice, pagamento) in prossimi(simulation: simulation, settings: settings, now: now, calendar: calendar).enumerated() {
            let content = UNMutableNotificationContent()
            // Solo il corpo: il nome dell'app lo mette iOS nell'intestazione.
            content.body = renderBody(settings.template, amount: importo(pagamento.amount))
            content.sound = .default

            let quando = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: pagamento.date)
            let trigger = UNCalendarNotificationTrigger(dateMatching: quando, repeats: false)
            let request = UNNotificationRequest(
                identifier: "\(prefix)\(Int(pagamento.date.timeIntervalSince1970))-\(indice)",
                content: content,
                trigger: trigger
            )
            try? await center.add(request)
        }
    }

    /// I pagamenti da far suonare: quelli ancora da venire, campionati fino a
    /// `perDay` al giorno e troncati al tetto complessivo.
    static func prossimi(
        simulation: Simulation,
        settings: AutoNotificationSettings,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [Simulation.ScheduledPayment] {
        var out: [Simulation.ScheduledPayment] = []

        for giorno in 0..<max(1, settings.daysAhead) {
            // Offset negativo: -1 e' domani. Oggi conta solo da adesso in poi,
            // le notifiche gia' passate non si recuperano.
            let delGiorno = simulation.paymentSchedule(-giorno, now: now, calendar: calendar)
                .filter { $0.date > now }
            out.append(contentsOf: campiona(delGiorno, quanti: max(1, settings.perDay)))
        }

        return Array(out.sorted { $0.date < $1.date }.prefix(cap))
    }

    /// Prende `quanti` elementi distribuiti lungo la lista invece dei primi:
    /// pescando i primi, le notifiche si ammasserebbero al mattino e la sera
    /// non arriverebbe piu' niente.
    private static func campiona(_ lista: [Simulation.ScheduledPayment], quanti: Int) -> [Simulation.ScheduledPayment] {
        guard lista.count > quanti else { return lista }
        let passo = Double(lista.count) / Double(quanti)
        return (0..<quanti).map { lista[min(lista.count - 1, Int(Double($0) * passo))] }
    }

    /// La cifra come la scrive la dashboard, senza simbolo: quello sta nel
    /// testo, che lo scrivi tu.
    private static func importo(_ value: Double) -> String {
        String(format: "%.2f", value)
    }
}
