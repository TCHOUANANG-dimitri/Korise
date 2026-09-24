import React, { useState } from 'react';
import {
  BackHandler,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFonts } from 'expo-font';
import { Signika_700Bold } from '@expo-google-fonts/signika/700Bold';
import { Urbanist_400Regular } from '@expo-google-fonts/urbanist/400Regular';
import { Urbanist_500Medium } from '@expo-google-fonts/urbanist/500Medium';
import Home from 'lucide-react-native/icons/house';
import Menu from 'lucide-react-native/icons/menu';
import Package from 'lucide-react-native/icons/package';
import ShoppingCart from 'lucide-react-native/icons/shopping-cart';
import Wallet from 'lucide-react-native/icons/wallet';

import { AppProvider, useApp } from './src/context/AppContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { SaleScreen } from './src/screens/SaleScreen';
import { MoneyScreen } from './src/screens/MoneyScreen';
import { StockScreen } from './src/screens/StockScreen';
import { MoreScreen, SubScreen } from './src/screens/MoreScreen';
import { CreditsScreen } from './src/screens/CreditsScreen';
import { ClosingScreen } from './src/screens/ClosingScreen';
import { ShiftScreen } from './src/screens/ShiftScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { AnomaliesScreen } from './src/screens/AnomaliesScreen';
import { ReportsScreen } from './src/screens/ReportsScreen';
import { TeamScreen } from './src/screens/TeamScreen';
import { JournalScreen } from './src/screens/JournalScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { IdleLock } from './src/components/IdleLock';
import { TopBar } from './src/components/Navigation';
import { palette, RADIUS, SPACING, typo } from './src/theme';

// Même couverture fonctionnelle que le web (décision du fondateur, 2026-09-24) : cinq onglets pour la
// saisie rapide et la consultation quotidienne (Accueil, Vente, Argent, Stock, Plus) ; « Plus » ouvre
// le reste — clients & crédits, shift, clôture, historique, anomalies, rapports, équipe, paramètres.
type Tab = 'home' | 'sale' | 'money' | 'stock' | 'more';

const TABS: { key: Tab; label: string; Icon: typeof ShoppingCart }[] = [
  { key: 'home', label: 'Accueil', Icon: Home },
  { key: 'sale', label: 'Vente', Icon: ShoppingCart },
  { key: 'money', label: 'Argent', Icon: Wallet },
  { key: 'stock', label: 'Stock', Icon: Package },
  { key: 'more', label: 'Plus', Icon: Menu },
];

export default function App() {
  const [fontsLoaded] = useFonts({
    Signika_700Bold,
    Urbanist_400Regular,
    Urbanist_500Medium,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="light-content" backgroundColor={palette.background} />
        <Image source={require('./assets/brand/korise-icon-white.png')} style={styles.splashIcon} resizeMode="contain" />
      </View>
    );
  }

  return (
    <AppProvider>
      <StatusBar barStyle="light-content" backgroundColor={palette.background} />
      <Root />
    </AppProvider>
  );
}

function Root() {
  const { status, ready } = useApp();

  if (!ready || status === 'loading') {
    return (
      <View style={styles.splash}>
        <Image source={require('./assets/brand/korise-icon-white.png')} style={styles.splashIcon} resizeMode="contain" />
      </View>
    );
  }

  if (status === 'loggedOut') return <AuthScreen />;
  return (
    <IdleLock>
      <Shell />
    </IdleLock>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>('home');
  const [sub, setSub] = useState<SubScreen | null>(null);

  // Le bouton retour d'Android ferme d'abord l'écran secondaire, puis revient à l'accueil.
  React.useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sub) {
        setSub(null);
        return true;
      }
      if (tab !== 'home') {
        setTab('home');
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [sub, tab]);

  const back = () => setSub(null);

  const renderSub = () => {
    switch (sub) {
      case 'credits':
        return <CreditsScreen onBack={back} />;
      case 'closing':
        return <ClosingScreen onBack={back} />;
      case 'shift':
        return <ShiftScreen onBack={back} />;
      case 'history':
        return <HistoryScreen onBack={back} />;
      case 'anomalies':
        return <AnomaliesScreen onBack={back} />;
      case 'reports':
        return <ReportsScreen onBack={back} />;
      case 'team':
        return <TeamScreen onBack={back} />;
      case 'journal':
        return <JournalScreen onBack={back} />;
      case 'settings':
        return <SettingsScreen onBack={back} />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <TopBar />
      <View style={styles.body}>
        {sub ? (
          renderSub()
        ) : (
          <>
            {tab === 'home' && <HomeScreen goto={() => undefined} />}
            {tab === 'sale' && <SaleScreen />}
            {tab === 'money' && <MoneyScreen />}
            {tab === 'stock' && <StockScreen />}
            {tab === 'more' && <MoreScreen open={setSub} />}
          </>
        )}
      </View>
      <View style={styles.tabBar}>
        {TABS.map(({ key, label, Icon }) => {
          const active = key === tab && !sub;
          const color = active ? palette.accent : palette.textMuted;
          return (
            <Pressable
              key={key}
              style={styles.tab}
              onPress={() => {
                setSub(null);
                setTab(key);
              }}
              hitSlop={8}
            >
              <Icon size={22} color={color} />
              <Text style={[styles.tabLabel, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center' },
  splashIcon: { width: 96, height: 96, borderRadius: RADIUS.card },
  safe: { flex: 1, backgroundColor: palette.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0 },
  body: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: palette.background,
    borderTopWidth: 1,
    borderTopColor: '#22242A',
    paddingTop: SPACING.sm,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xl : SPACING.sm,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { fontFamily: typo.microLabel.fontFamily, fontSize: 11, letterSpacing: 0.4 },
});
