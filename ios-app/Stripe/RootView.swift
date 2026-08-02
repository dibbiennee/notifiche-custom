import SwiftUI
import UserNotifications

/// Le cinque sezioni della barra in basso. Solo Home e' costruita: le altre
/// esistono perche' la barra dello screenshot ne ha cinque.
enum Tab: String, CaseIterable, Identifiable {
    case home, payments, balances, customers, search

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .payments: return "Payments"
        case .balances: return "Balances"
        case .customers: return "Customers"
        case .search: return "Search"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house"
        case .payments: return "banknote"
        case .balances: return "wallet.bifold"
        case .customers: return "person.2"
        case .search: return "magnifyingglass"
        }
    }
}

/// La barra e' disegnata a mano invece che con `TabView`: quella di sistema
/// cambia aspetto a ogni versione di iOS, e qui serve che resti identica allo
/// screenshot.
struct RootView: View {
    @StateObject private var store = DashboardStore()
    @State private var tab: Tab = .home

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()

            Group {
                switch tab {
                case .home: DashboardView()
                default: PlaceholderView(title: tab.title)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) { tabBar }
        }
        .environmentObject(store)
        .preferredColorScheme(.dark)
        .task {
            _ = try? await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
        }
    }

    private var tabBar: some View {
        VStack(spacing: 0) {
            Rectangle()
                .fill(Theme.separator)
                .frame(height: 1)

            HStack(spacing: 0) {
                ForEach(Tab.allCases) { item in
                    VStack(spacing: 4) {
                        Image(systemName: item.icon)
                            .font(.system(size: 18))
                        Text(item.title)
                            .font(.system(size: 10))
                    }
                    .foregroundStyle(item == tab ? Theme.accent : Theme.tabInactive)
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                    .onTapGesture { tab = item }
                }
            }
            .padding(.top, 7.7)
            .padding(.bottom, 3)
        }
        .background(Theme.bar)
    }
}

/// Le sezioni non costruite: meglio una schermata onesta che finti contenuti.
private struct PlaceholderView: View {
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(Theme.primaryText)
                .padding(.horizontal, SCREEN_INSET)
                .padding(.top, 22)

            Spacer()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.background)
    }
}
