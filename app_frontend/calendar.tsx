
// app/calendar.tsx
import {
  Text, View, TouchableOpacity, StyleSheet, ScrollView,
  Image, FlatList, Alert, ActivityIndicator
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { useState, useEffect, useCallback } from "react";
import { Calendar } from "react-native-calendars";

const API_BASE = "http://10.193.232.8:5000";
// const API_BASE = "http://192.168.10.2:5000";

export default function OutfitCalendar() {
  const router = useRouter();

  const [history, setHistory] = useState([]);             // all outfit logs
  const [items, setItems] = useState([]);                 // wardrobe inventory
  const [selectedDate, setSelectedDate] = useState(null); // YYYY-MM-DD string
  const [loading, setLoading] = useState(false);

  // log-an-outfit modal state
  const [logging, setLogging] = useState(false);
  const [logSelection, setLogSelection] = useState([]);

  // fetch both history and inventory
  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [histRes, invRes] = await Promise.all([
        fetch(`${API_BASE}/outfit-history`),
        fetch(`${API_BASE}/inventory`),
      ]);
      const hist = await histRes.json();
      const inv  = await invRes.json();
      setHistory(hist);
      setItems(inv);
    } catch (err) {
      Alert.alert("Failed to load", err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // build the marked-dates object for the calendar from history
  // every date that has at least one logged outfit gets a dot
  const markedDates = {};
  history.forEach((entry) => {
    markedDates[entry.date_worn] = {
      marked: true,
      dotColor: "#000",
    };
  });
  if (selectedDate) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] || {}),
      selected: true,
      selectedColor: "#000",
    };
  }

  // outfits worn on the selected date
  const outfitsForDate = selectedDate
    ? history.filter((e) => e.date_worn === selectedDate)
    : [];

  // toggle item in/out of the "log outfit" selection
  const toggleLogItem = (id) => {
    setLogSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // submit the logged outfit for the selected date
  const submitLog = async () => {
    if (logSelection.length === 0) {
      Alert.alert("Pick something!", "Select at least one item.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/log-outfit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_ids: logSelection,
          date:     selectedDate,
        }),
      });
      if (!response.ok) throw new Error("Server error: " + response.status);

      // reset and refresh
      setLogSelection([]);
      setLogging(false);
      await fetchAll();
    } catch (err) {
      Alert.alert("Log failed", err.message);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.title}>Outfit Calendar</Text>
        <Text style={styles.subtitle}>Tap a date to see what you wore.</Text>

        {/* Calendar */}
        <Calendar
          onDayPress={(day) => {
            setSelectedDate(day.dateString);
            setLogging(false);
            setLogSelection([]);
          }}
          markedDates={markedDates}
          theme={{
            todayTextColor: "#000",
            arrowColor: "#000",
          }}
          style={styles.calendar}
        />

        {loading && <ActivityIndicator style={{ marginTop: 16 }} />}

        {/* Date detail section */}
        {selectedDate && !logging && (
          <View style={styles.detailSection}>
            <Text style={styles.dateHeader}>{selectedDate}</Text>

            {outfitsForDate.length === 0 ? (
              <Text style={styles.emptyText}>No outfit logged for this day.</Text>
            ) : (
              outfitsForDate.map((entry) => (
                <View key={entry.log_id} style={styles.outfitCard}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {entry.items.map((item, i) => (
                      <View key={i} style={styles.itemChip}>
                        {item.image_path ? (
                          <Image
                            source={{ uri: `${API_BASE}/image/${item.image_path}` }}
                            style={styles.itemImage}
                          />
                        ) : (
                          <View style={styles.itemImagePlaceholder}>
                            <Text>👕</Text>
                          </View>
                        )}
                        <Text style={styles.itemLabel} numberOfLines={1}>
                          {item.color} {item.category}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ))
            )}

            <TouchableOpacity
              style={styles.logBtn}
              onPress={() => setLogging(true)}
            >
              <Text style={styles.logBtnText}>+ Log an outfit for this day</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Log-outfit picker */}
        {selectedDate && logging && (
          <View style={styles.detailSection}>
            <Text style={styles.dateHeader}>What did you wear?</Text>
            <Text style={styles.subtitle}>Tap items to add them to the outfit.</Text>

            <FlatList
              data={items}
              keyExtractor={(item) => item.id.toString()}
              numColumns={2}
              scrollEnabled={false}
              columnWrapperStyle={styles.row}
              renderItem={({ item }) => {
                const selected = logSelection.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[styles.card, selected && styles.cardSelected]}
                    onPress={() => toggleLogItem(item.id)}
                  >
                    {item.image_path ? (
                      <Image
                        source={{ uri: `${API_BASE}/image/${item.image_path}` }}
                        style={styles.cardImage}
                      />
                    ) : (
                      <View style={styles.cardImagePlaceholder}>
                        <Text style={{ fontSize: 28 }}>👕</Text>
                      </View>
                    )}
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardCategory}>{item.category}</Text>
                      <Text style={styles.cardColor}>{item.color}</Text>
                    </View>
                    {selected && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />

            <View style={styles.logActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setLogging(false); setLogSelection([]); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  logSelection.length === 0 && styles.saveBtnDisabled,
                ]}
                onPress={submitLog}
                disabled={logSelection.length === 0}
              >
                <Text style={styles.saveBtnText}>Save Outfit</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Back button */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content:   { paddingTop: 60, paddingHorizontal: 16, paddingBottom: 40 },

  title:    { fontSize: 28, fontWeight: "bold", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 16 },

  calendar: {
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },

  detailSection: {
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  dateHeader: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
  emptyText:  { color: "#999", fontSize: 14, fontStyle: "italic", marginBottom: 12 },

  outfitCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },

  itemChip: {
    width: 72,
    marginRight: 10,
    alignItems: "center",
  },
  itemImage: {
    width: 64, height: 64, borderRadius: 8,
  },
  itemImagePlaceholder: {
    width: 64, height: 64, borderRadius: 8,
    backgroundColor: "#e0e0e0",
    justifyContent: "center", alignItems: "center",
  },
  itemLabel: {
    fontSize: 11, color: "#555",
    textAlign: "center", marginTop: 4,
    textTransform: "capitalize",
  },

  logBtn: {
    backgroundColor: "#000",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  logBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },

  // log-outfit picker (inline)
  row: { justifyContent: "space-between", marginBottom: 12 },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardSelected: { borderColor: "#000" },
  cardImage: { width: "100%", height: 120 },
  cardImagePlaceholder: {
    width: "100%", height: 120,
    backgroundColor: "#e0e0e0",
    justifyContent: "center", alignItems: "center",
  },
  cardInfo: { padding: 8 },
  cardCategory: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  cardColor:    { fontSize: 11, color: "#666", textTransform: "capitalize", marginTop: 2 },
  selectedBadge: {
    position: "absolute", top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#000",
    justifyContent: "center", alignItems: "center",
  },
  selectedBadgeText: { color: "#fff", fontSize: 14, fontWeight: "bold" },

  logActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#999",
    alignItems: "center",
  },
  cancelBtnText: { color: "#000", fontSize: 14 },
  saveBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: "#000",
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: "#ccc" },
  saveBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  backBtn: {
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
  backBtnText: { color: "#666", fontSize: 15 },
});
