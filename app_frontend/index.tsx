import { Text, View, TouchableOpacity, StyleSheet, FlatList, Image, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useState, useCallback } from "react";
import { Stack } from "expo-router";

const API_BASE = "http://10.193.232.8:5000"; // same IP as add-item.tsx
// const API_BASE = "http://192.168.10.2:5000";

export default function Index() {
  const router = useRouter();
  const [items, setItems] = useState([]);

  // fetch inventory from backend
  const fetchInventory = async () => {
    try {
      const response = await fetch(`${API_BASE}/inventory`);
      const data = await response.json();
      setItems(data);
      // console.log("inventory items:", JSON.stringify(data[0])); // debug print
    } catch (err) {
      console.log("Failed to fetch inventory:", err.message);
    }
  };

  // re-fetch every time you come back to this screen
  useFocusEffect(
    useCallback(() => {
      fetchInventory();
    }, [])
  );

  // delete an item by id
  const deleteItem = async (id) => {
    // ask user to confirm before deleting
    Alert.alert(
      "Delete Item",
      "Are you sure you want to remove this item?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // const response = await fetch(`${API_BASE}/delete`, {
              //   method: "DELETE",
              //   headers: { "Content-Type": "application/json" },
              //   body: JSON.stringify({ item_id }),
              // });
              const response = await fetch(`${API_BASE}/inventory/${id}`, {
                method: 'DELETE',
              });

              if (!response.ok) throw new Error("Server error: " + response.status);

              // remove from local list immediately so UI updates without refetching
              setItems((prev) => prev.filter((item) => item.id !== id));

            } catch (err) {
              Alert.alert("Delete failed", err.message);
            }
          },
        },
      ]
    );
  };

  // renders each clothing item card
  const renderItem = ({ item }) => (
    <View style={styles.card}>
      {/* Show image if we have one */}
      {item.image_path ? (
        <Image
          source={{ uri: `${API_BASE}/image/${item.image_path}` }}
          style={styles.cardImage}
        />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Text style={{ fontSize: 32 }}>👕</Text>
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardCategory}>{item.category}</Text>
        <Text style={styles.cardColor}>{item.color}</Text>
      </View>

      {/* Delete button — top right corner of card */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => deleteItem(item.id)}
      >
        <Text style={styles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.container}>

      {/* to go to outfits recommendation page */}
      <TouchableOpacity
        style={styles.outfitButton}
        onPress={() => router.push("/outfits")}>
        <Text style={styles.outfitText}>👗 Get Outfit Suggestions</Text>
      </TouchableOpacity>

      {/* NEW: build your own outfit */}
      <TouchableOpacity
        style={styles.outfitButton}
        onPress={() => router.push("/build-outfit")}>
        <Text style={styles.outfitText}>✨ Build Your Own Outfit</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.outfitButton}
        onPress={() => router.push("/calendar")}>
        <Text style={styles.outfitText}>📅 Outfit Calendar</Text>
      </TouchableOpacity>

      {/* <TouchableOpacity onPress={() => router.push("/test-tryon")}>
      <Text>Test Try-On</Text>
      </TouchableOpacity> */}

      <Text style={styles.title}>My Wardrobe</Text>

      {/* If no items, show empty state */}
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👗</Text>
          <Text style={styles.emptyText}>No items yet. Add some!</Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => router.push("/add-item")}
          >
            <Text style={styles.emptyButtonText}>+ Add First Item</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item, index) => index.toString()}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Floating + button — only shows when there are items */}
      {items.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push("/add-item")}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      )}

    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyText: {
    color: "#999",
    fontSize: 18,
    marginBottom: 8,
  },
  emptyButton: {
    backgroundColor: "#000",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    paddingBottom: 100,
  },
  row: {
    justifyContent: "space-between",
    marginBottom: 16,
  },
  card: {
    width: "48%",
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 160,
  },
  cardImagePlaceholder: {
    width: "100%",
    height: 160,
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
  },
  cardInfo: {
    padding: 10,
  },
  cardCategory: {
    fontSize: 15,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  cardColor: {
    fontSize: 13,
    color: "#666",
    textTransform: "capitalize",
    marginTop: 2,
  },
  outfitButton: {
  backgroundColor: "#f5f5f5",
  paddingVertical: 20,
  paddingHorizontal: 30,
  borderRadius: 12,
  marginBottom: 12,
  alignSelf: "center",
  },
  outfitText: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111",
  },
  deleteBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  fab: {
    position: "absolute",
    bottom: 36,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  fabText: {
    color: "#fff",
    fontSize: 32,
    lineHeight: 36,
  },
});
