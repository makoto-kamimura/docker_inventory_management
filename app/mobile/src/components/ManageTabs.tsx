import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { api, type Category, type Item, type ItemGroup, type StorageLocation } from "../api";
import { colors, styles } from "../styles";
import { FooterButton, ListCard, SmallButton, confirmDelete } from "./ui";

/** API 呼び出し → 再読み込み。失敗時は errorTitle でアラートを出して false を返す */
export type Perform = (errorTitle: string, action: () => Promise<unknown>) => Promise<boolean>;

export function CategoryManager({
  categories,
  loading,
  perform,
}: {
  categories: Category[];
  loading: boolean;
  perform: Perform;
}) {
  const [name, setName] = useState("");

  const add = async () => {
    if (await perform("カテゴリ追加失敗", () => api.createCategory(name.trim()))) setName("");
  };

  const remove = (c: Category) =>
    confirmDelete(
      "カテゴリの削除",
      `「${c.name}」を削除しますか？物品が登録されている場合は削除できません。`,
      () => void perform("削除失敗", () => api.deleteCategory(c.id)),
    );

  return (
    <>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.h2}>カテゴリ追加</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="例: 工具"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <ListCard
          title="カテゴリ一覧"
          loading={loading}
          emptyText="カテゴリがありません"
          data={categories}
          keyOf={(c) => c.id}
          renderRow={(c) => (
            <View style={styles.listRow}>
              <Text style={styles.listRowText}>{c.name}</Text>
              <SmallButton label="削除" danger onPress={() => remove(c)} />
            </View>
          )}
        />
      </ScrollView>
      <FooterButton disabled={!name.trim()} onPress={add} />
    </>
  );
}

export function GroupManager({
  itemGroups,
  items,
  loading,
  perform,
}: {
  itemGroups: ItemGroup[];
  items: Item[];
  loading: boolean;
  perform: Perform;
}) {
  const [name, setName] = useState("");

  const add = async () => {
    if (await perform("グループ追加失敗", () => api.createItemGroup(name.trim()))) setName("");
  };

  const remove = (g: ItemGroup) =>
    confirmDelete(
      "グループの削除",
      `「${g.name}」を削除しますか？グループに属する品目のグループ設定は解除されます（品目は削除されません）。`,
      () => void perform("削除失敗", () => api.deleteItemGroup(g.id)),
    );

  return (
    <>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.h2}>グループ追加</Text>
          <Text style={styles.muted}>
            グループを作成し、複数の品目をまとめます。在庫切れ表示ではグループ内に在庫がある品目が1つでもあればグループ全体が表示されません。
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="例: トナーカートリッジ"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <ListCard
          title="グループ一覧"
          loading={loading}
          emptyText="グループがありません"
          data={itemGroups}
          keyOf={(g) => g.id}
          renderRow={(g) => {
            const members = items.filter((it) => it.group_id === g.id);
            return (
              <View style={styles.listRow}>
                <View style={styles.flex}>
                  <View style={styles.groupManageHeader}>
                    <Text style={styles.groupManageTitle}>{g.name}</Text>
                    <Text style={styles.muted}>{members.length} 品目</Text>
                  </View>
                  {members.length > 0 && (
                    <View style={styles.groupMembers}>
                      {members.map((it) => (
                        <Text
                          key={it.id}
                          style={[styles.groupMemberText, it.stock <= 0 && styles.groupMemberEmpty]}
                        >
                          {it.name} ({it.stock})
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
                <SmallButton label="削除" danger onPress={() => remove(g)} />
              </View>
            );
          }}
        />
      </ScrollView>
      <FooterButton disabled={!name.trim()} onPress={add} />
    </>
  );
}

export function StorageManager({
  storageLocations,
  loading,
  perform,
}: {
  storageLocations: StorageLocation[];
  loading: boolean;
  perform: Perform;
}) {
  const [description, setDescription] = useState("");

  const add = async () => {
    if (await perform("保管場所追加失敗", () => api.createStorageLocation(description.trim()))) {
      setDescription("");
    }
  };

  const remove = (sl: StorageLocation) =>
    confirmDelete(
      "保管場所の削除",
      `「${sl.description}」を削除しますか？`,
      () => void perform("削除失敗", () => api.deleteStorageLocation(sl.id)),
    );

  return (
    <>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.h2}>保管場所追加</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="保管場所 (自由記述)　例: 2F 倉庫 棚A-3"
            placeholderTextColor={colors.placeholder}
            multiline
          />
        </View>

        <ListCard
          title="保管場所一覧"
          loading={loading}
          emptyText="保管場所がありません"
          data={storageLocations}
          keyOf={(sl) => sl.id}
          renderRow={(sl) => (
            <View style={styles.listRow}>
              <Text style={styles.listRowText}>{sl.description}</Text>
              <SmallButton label="削除" danger onPress={() => remove(sl)} />
            </View>
          )}
        />
      </ScrollView>
      <FooterButton disabled={!description.trim()} onPress={add} />
    </>
  );
}
