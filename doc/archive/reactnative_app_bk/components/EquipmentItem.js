import React, { useRef } from 'react';
import { Animated, TouchableOpacity, Text } from 'react-native';

export default function EquipmentItem({ item, onPress }) {
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.3, duration: 200, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true })
    ]).start();
    onPress();
  };

  return (
    <Animated.View style={{ opacity: fadeAnim }}>
      <TouchableOpacity onPress={handlePress} style={{ padding: 15, borderBottomWidth: 1 }}>
        <Text style={{ fontSize: 18 }}>{item.name}（残り: {item.stock}）</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}