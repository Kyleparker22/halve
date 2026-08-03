import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useTheme } from '../../src/theme';

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 20 }} accessibilityElementsHidden>
      {glyph}
    </Text>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTitleStyle: { color: theme.text },
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Friends', tabBarIcon: icon('◆') }} />
      <Tabs.Screen name="rounds" options={{ title: 'Rounds', tabBarIcon: icon('⛳') }} />
      <Tabs.Screen name="social" options={{ title: 'Social', tabBarIcon: icon('✦') }} />
      <Tabs.Screen name="trips" options={{ title: 'Trips', tabBarIcon: icon('✈') }} />
      <Tabs.Screen name="profile" options={{ title: 'You', tabBarIcon: icon('●') }} />
    </Tabs>
  );
}
