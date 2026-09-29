import { useState, useEffect } from 'react';
import { View, Text, TextInput, Button, Picker } from 'react-native';
import axios from 'axios';
import { useNavigation } from '@react-navigation/native';

export default function AddEquipment() {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState([]);
  const navigation = useNavigation();

  useEffect(() => {
    axios.get('http://localhost:8000/api/categories').then(res => setCategories(res.data));
  }, []);

  const addEquipment = async () => {
    await axios.post('http://localhost:8000/api/equipments', { name, category_id: categoryId });
    navigation.goBack();
  };

  return (
    <View style={{ padding: 20 }}>
      <Text>備品名</Text>
      <TextInput value={name} onChangeText={setName} style={{ borderWidth: 1, marginBottom: 10, padding: 5 }} />

      <Text>カテゴリ</Text>
      <Picker selectedValue={categoryId} onValueChange={(v) => setCategoryId(v)}>
        {categories.map(c => <Picker.Item key={c.id} label={c.name} value={c.id} />)}
      </Picker>

      <Button title="追加" onPress={addEquipment} />
    </View>
  );
}