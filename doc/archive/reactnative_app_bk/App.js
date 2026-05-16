import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EquipmentList from './screens/EquipmentList';
import AddEquipment from './screens/AddEquipment';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="EquipmentList">
        <Stack.Screen name="EquipmentList" component={EquipmentList} options={{ title: '備品一覧' }} />
        <Stack.Screen name="AddEquipment" component={AddEquipment} options={{ title: '備品追加' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}