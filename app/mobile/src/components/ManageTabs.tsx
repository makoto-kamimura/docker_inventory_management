import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { api, type Category, type Item, type ItemGroup, type StorageLocation } from "../api";
import { categoryColor } from "../inventory";
import { colors, styles } from "../styles";
import { Badge, FooterButton, Hint, ListCard, ScreenIntro, SmallButton, confirmDelete } from "./ui";

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
        <ScreenIntro screen="category" />
        <View style={styles.card}>
          <Text style={styles.h2}>カテゴリ追加</Text>
          <Hint>色は自動で割り当てられ、在庫一覧の見出しに表示されます。</Hint>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="例: 食品、日用品、工具"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <ListCard
          title="カテゴリ一覧"
          icon="🏷️"
          loading={loading}
          emptyText="カテゴリがありません"
          emptyDescription="物品を登録するには、先にカテゴリを 1 つ以上作成してください。"
          data={categories}
          keyOf={(c) => c.id}
          renderRow={(c) => (
            <View style={[styles.listRow, styles.groupManageHeader]}>
              <View style={[styles.colorDot, { backgroundColor: categoryColor(c.id) }]} />
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
        <ScreenIntro screen="group" />
        <View style={styles.card}>
          <Text style={styles.h2}>グループ追加</Text>
          <Hint>在庫切れの絞り込みでは、グループ内に在庫のある品目が 1 つでもあれば表示されません。</Hint>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="例: 食器用洗剤"
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <ListCard
          title="グループ一覧"
          icon="🗂️"
          loading={loading}
          emptyText="グループがありません"
          emptyDescription="グループを作ったら、在庫一覧の品目から設定できます。"
          data={itemGroups}
          keyOf={(g) => g.id}
          renderRow={(g) => {
            const members = items.filter((it) => it.group_id === g.id);
            return (
              <View style={styles.listRow}>
                <View style={styles.flex}>
                  <View style={styles.groupManageHeader}>
                    <Text style={styles.groupManageTitle}>{g.name}</Text>
                    <Badge label={`${members.length} 品目`} />
                  </View>
                  {members.length > 0 && (
                    <View style={styles.groupMembers}>
                      {members.map((it) => (
                        <Badge
                          key={it.id}
                          tone={it.stock <= 0 ? "danger" : "neutral"}
                          label={`${it.name} ${it.stock}`}
                        />
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
        <ScreenIntro screen="storage" />
        <View style={styles.card}>
          <Text style={styles.h2}>保管場所追加</Text>
          <Hint>棚や部屋など、探すときにわかる書き方がおすすめです。</Hint>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="例: キッチン 吊り戸棚の左"
            placeholderTextColor={colors.placeholder}
            multiline
          />
        </View>

        <ListCard
          title="保管場所一覧"
          icon="📍"
          loading={loading}
          emptyText="保管場所がありません"
          emptyDescription="保管場所を登録すると、在庫一覧を場所ごとに表示できます。"
          data={storageLocations}
          keyOf={(sl) => sl.id}
          renderRow={(sl) => (
            <View style={styles.listRow}>
              <Text style={styles.listRowText}>📍 {sl.description}</Text>
              <SmallButton label="削除" danger onPress={() => remove(sl)} />
            </View>
          )}
        />
      </ScrollView>
      <FooterButton disabled={!description.trim()} onPress={add} />
    </>
  );
}
