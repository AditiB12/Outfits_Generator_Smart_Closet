import {
  Text, View, TouchableOpacity, StyleSheet, ScrollView,
  Image, ActivityIndicator, Alert
} from "react-native";
import { useState, useEffect } from "react";
import * as FileSystem from "expo-file-system/legacy";

const API_BASE = "http://10.193.232.8:5000";
// const API_BASE = "http://192.168.10.2:5000";


const getImageBase64 = async (path) => {
  // download the image to a local temp file first
  const localUri = FileSystem.cacheDirectory + "temp_image.jpg";
  await FileSystem.downloadAsync(`${API_BASE}/image/${path}`, localUri);
  
  // read it as base64 using the string encoding constant directly
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: "base64",  // use the string "base64" instead of FileSystem.EncodingType.Base64
  });

  // strip data URI prefix if present, backend needs pure base64
  if (base64.includes(",")) {
    base64 = base64.split(",")[1];
  }

  return base64;
};

// ── one outfit card: shows outfit description, items, reason, try-on ─────────
function OutfitCard({ suggestion, allItems }) {
  const [tryOnImage, setTryOnImage] = useState(null);
  const [tryOnLoading, setTryOnLoading] = useState(false);

  // look up full item objects from allItems using item_ids
  const outfitItems = suggestion.item_ids
    .map((id) => allItems.find((item) => item.id === id))
    .filter(Boolean);

    // debug
    // const clothingBase64 = await getImageBase64(item.image_path);
    // console.log("clothing base64 length:", clothingBase64.length);
    // console.log("clothing base64 start:", clothingBase64.substring(0, 50));

  const handleTryOn = async () => {
    setTryOnLoading(true);
    setTryOnImage(null);

    try {
      // start with woman.jpg fetched from backend
      console.log("Step 1: fetching woman.jpg...");
      let currentPersonBase64 = await getImageBase64("img/woman.jpg");
      console.log("Step 2: got woman.jpg, length:", currentPersonBase64?.length);

      // debug
        // console.log("woman base64 length:", currentPersonBase64.length);
        // console.log("woman base64 start:", currentPersonBase64.substring(0, 50));

      // apply each clothing item one at a time, accumulating the result
      for (const item of outfitItems) {
        if (!item.image_path) continue;

        console.log("Step 3: fetching clothing item:", item.image_path);
        const clothingBase64 = await getImageBase64(item.image_path);
        console.log("Step 4: got clothing, length:", clothingBase64?.length);

        console.log("Step 5: sending to /try-on...");
        const response = await fetch(`${API_BASE}/try-on`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            person_image: currentPersonBase64,
            clothing_image: clothingBase64,
          }),
        });

        if (!response.ok) throw new Error("Try-on failed: " + response.status);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // result becomes the new person image for the next item
        // After getting the result back, strip any data URI prefix just in case
        let raw = data.result_image;
        if (raw.includes(",")) {
        raw = raw.split(",")[1];
        }
        currentPersonBase64 = raw;
      }

      setTryOnImage(`data:image/jpeg;base64,${currentPersonBase64}`);

    } catch (err) {
      Alert.alert("Try-on failed", err.message);
    } finally {
      setTryOnLoading(false);
    }
  };

  return (
    <View style={styles.outfitCard}>
      {/* Outfit description */}
      <Text style={styles.outfitName}>{suggestion.outfit}</Text>

      {/* Reason */}
      {suggestion.reason && (
        <Text style={styles.outfitReason}>{suggestion.reason}</Text>
      )}

      {/* Item thumbnails */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemsRow}>
        {outfitItems.map((item, i) => (
          <View key={i} style={styles.itemChip}>
            {item.image_path ? (
              <Image
                source={{ uri: `${API_BASE}/image/${item.image_path}` }}
                style={styles.itemImage}
              />
            ) : (
              <View style={styles.itemImagePlaceholder}>
                <Text style={{ fontSize: 20 }}>👕</Text>
              </View>
            )}
            <Text style={styles.itemLabel} numberOfLines={1}>
              {item.color} {item.category}
            </Text>
          </View>
        ))}
      </ScrollView>

      {/* Try On button */}
      <TouchableOpacity
        style={styles.tryOnBtn}
        onPress={handleTryOn}
        disabled={tryOnLoading}
      >
        {tryOnLoading ? (
          <View style={styles.tryOnBtnInner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.tryOnBtnText}>  Generating...</Text>
          </View>
        ) : (
          <Text style={styles.tryOnBtnText}>👗 Try On</Text>
        )}
      </TouchableOpacity>

      {/* Try-on result */}
      {tryOnImage && (
        <View style={styles.tryOnResult}>
          <Text style={styles.tryOnResultLabel}>Try-on result:</Text>
          <Image
            source={{ uri: tryOnImage }}
            style={styles.tryOnResultImage}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
}

// ── one section block (Basic / Weather / Calendar) ───────────────────────────
function SuggestionSection({ title, subtitle, suggestions, loading, onRefresh, allItems }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} disabled={loading}>
          <Text style={styles.refreshBtnText}>{loading ? "..." : "↻ Refresh"}</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator size="small" color="#000" style={{ marginVertical: 16 }} />
      )}

      {!loading && suggestions.length === 0 && (
        <Text style={styles.emptyText}>Tap Refresh to get suggestions!</Text>
      )}

      {!loading && suggestions.map((suggestion, index) => (
        <OutfitCard key={index} suggestion={suggestion} allItems={allItems} />
      ))}
    </View>
  );
}

// ── MAIN SCREEN ──────────────────────────────────────────────────────────────
export default function Outfits() {
  const [allItems, setAllItems] = useState([]);

  const [basicSuggestions,    setBasicSuggestions]    = useState([]);
  const [weatherSuggestions,  setWeatherSuggestions]  = useState([]);
  const [calendarSuggestions, setCalendarSuggestions] = useState([]);

  const [weatherInfo,  setWeatherInfo]  = useState(null);
  const [calendarInfo, setCalendarInfo] = useState(null);

  const [loadingBasic,    setLoadingBasic]    = useState(false);
  const [loadingWeather,  setLoadingWeather]  = useState(false);
  const [loadingCalendar, setLoadingCalendar] = useState(false);

  // fetch inventory once on mount so we can look up items by id
  useEffect(() => {
    fetch(`${API_BASE}/inventory`)
      .then((r) => r.json())
      .then((data) => setAllItems(data))
      .catch((err) => console.log("Failed to load inventory:", err.message));
  }, []);

  const fetchBasic = async () => {
    setLoadingBasic(true);
    try {
      const response = await fetch(`${API_BASE}/suggest`);
      const data = await response.json();
      setBasicSuggestions(data.suggestions || []);
    } catch (err) {
      Alert.alert("Failed", err.message);
    } finally {
      setLoadingBasic(false);
    }
  };

  const fetchWeather = async () => {
    setLoadingWeather(true);
    try {
      const response = await fetch(`${API_BASE}/suggest-weather?lat=40.11&lon=-88.20`);
      const data = await response.json();
      setWeatherSuggestions(data.suggestions || []);
      setWeatherInfo({ temperature: data.temperature, weather: data.weather });
    } catch (err) {
      Alert.alert("Failed", err.message);
    } finally {
      setLoadingWeather(false);
    }
  };

  const fetchCalendar = async () => {
    setLoadingCalendar(true);
    try {
      const response = await fetch(`${API_BASE}/suggest-calendar`);
      const data = await response.json();
      setCalendarSuggestions(data.suggestions || []);
      setCalendarInfo({ date: data.date, holiday: data.holiday });
    } catch (err) {
      Alert.alert("Failed", err.message);
    } finally {
      setLoadingCalendar(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.pageTitle}>Outfit Suggestions</Text>

      <SuggestionSection
        title="✨ For You"
        suggestions={basicSuggestions}
        loading={loadingBasic}
        onRefresh={fetchBasic}
        allItems={allItems}
      />

      <SuggestionSection
        title="🌤 Based on Weather"
        subtitle={weatherInfo ? `${weatherInfo.weather}, ${weatherInfo.temperature}°` : null}
        suggestions={weatherSuggestions}
        loading={loadingWeather}
        onRefresh={fetchWeather}
        allItems={allItems}
      />

      <SuggestionSection
        title="📅 Based on Calendar"
        subtitle={calendarInfo ? (calendarInfo.holiday || calendarInfo.date) : null}
        suggestions={calendarSuggestions}
        loading={loadingCalendar}
        onRefresh={fetchCalendar}
        allItems={allItems}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
  refreshBtn: {
    backgroundColor: "#000",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
  },
  outfitCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  outfitName: {
    fontSize: 15,
    fontWeight: "600",
  },
  outfitReason: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
  },
  itemsRow: {
    flexDirection: "row",
  },
  itemChip: {
    alignItems: "center",
    marginRight: 10,
    width: 80,
  },
  itemImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    marginBottom: 4,
  },
  itemImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  itemLabel: {
    fontSize: 11,
    color: "#555",
    textAlign: "center",
    textTransform: "capitalize",
  },
  tryOnBtn: {
    backgroundColor: "#000",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  tryOnBtnInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  tryOnBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  tryOnResult: {
    gap: 6,
  },
  tryOnResultLabel: {
    fontSize: 13,
    color: "#666",
  },
  tryOnResultImage: {
    width: "100%",
    height: 300,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
  },
});
