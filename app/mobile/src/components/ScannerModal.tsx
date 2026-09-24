import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, SafeAreaView, Text, View } from "react-native";
import { styles } from "../styles";
import { PrimaryButton } from "./ui";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "qr"] as const;

/** カメラでバーコードを 1 件読み取る。読み取り後の処理が終わるまで次の読み取りは無視する */
export function ScannerModal({
  onClose,
  onScanned,
  targetLabel,
}: {
  onClose: () => void;
  onScanned: (barcode: string) => Promise<void>;
  targetLabel?: string | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);
  const [processing, setProcessing] = useState(false);

  const handleScanned = async (barcode: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setProcessing(true);
    try {
      await onScanned(barcode);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.scannerSafe}>
        <View style={styles.scannerHeader}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.scannerTitle}>バーコードをスキャン</Text>
            {targetLabel && <Text style={styles.scannerTarget}>{targetLabel}</Text>}
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.scannerClose}>閉じる</Text>
          </Pressable>
        </View>
        {!permission ? (
          <View style={styles.scannerBody}>
            <ActivityIndicator />
          </View>
        ) : !permission.granted ? (
          <View style={styles.scannerBody}>
            <Text style={styles.scannerHint}>カメラへのアクセスが許可されていません。</Text>
            <PrimaryButton label="権限をリクエスト" onPress={requestPermission} />
          </View>
        ) : (
          <View style={styles.scannerBody}>
            <CameraView
              style={styles.cameraView}
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={({ data }) => void handleScanned(data)}
            />
            <View style={styles.scannerOverlay} pointerEvents="none">
              <View style={styles.scannerFrame} />
            </View>
            <Text style={styles.scannerHint}>
              {processing ? "処理中..." : "枠内にバーコードを収めてください"}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}
