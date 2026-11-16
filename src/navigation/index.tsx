import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';

import { useAuthStore } from '../store/authStore';
import { RootStackParamList } from '../types';
import { colors } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import StreamTypeScreen from '../screens/StreamTypeScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import StreamsScreen from '../screens/StreamsScreen';
import PlayerScreen from '../screens/PlayerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Navigation() {
  const { isAuthenticated, isHydrating } = useAuthStore();

  if (isHydrating) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: colors.primary,
          background: colors.background,
          card: colors.surface,
          text: colors.text,
          border: colors.cardBorder,
          notification: colors.error,
        },
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="StreamType" component={StreamTypeScreen} />
            <Stack.Screen
              name="Categories"
              component={CategoriesScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Streams"
              component={StreamsScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Player"
              component={PlayerScreen}
              options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
