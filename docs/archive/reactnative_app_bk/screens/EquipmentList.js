import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Animated } from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';
import EquipmentItem from '../components/EquipmentItem';

export default function EquipmentList() {
  const [equipments, setEquipments] = useState([]);
  const navigation = useNavigation();

  const fetchEquipments = async () => {
    const res = await axios.get('http://localhost:8000/api/equipments/available');
    setEquipments(res.data);
  };

  const decreaseStock = async (id) => {
    try {
      await axios.post(`http://localhost:8000/api/equipments/${id}/decrease`);
      fetchEquipments();
    } catch (e) {
      alert('在庫がありません');
    }
  };

  useEffect(() => { fetchEquipments(); }, []);

  return (
    <View style={{ padding: 20 }}>
      <TouchableOpacity
        style={{ marginBottom: 20, backgroundColor: 'lightblue', padding: 10 }}
        onPress={() => navigation.navigate('AddEquipment')}
      >
        <Text>備品追加</Text>
      </TouchableOpacity>

      <FlatList
        data={equipments}
        renderItem={({ item }) => (
          <EquipmentItem item={item} onPress={() => decreaseStock(item.id)} />
        )}
        keyExtractor={item => item.id.toString()}
      />
    </View>
  );
}