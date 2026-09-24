// app/owner/dashboard/hairstyle-catalog.tsx
// Lets a salon owner build the style gallery that powers the customer-facing
// AI Hairstyle Try-On feature (app/hairstyle-ai.tsx). Follows the same
// image-upload pattern already used for staff photos in this project.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Colors from '@/constants/Colors';
import { ArrowLeft, Plus, Trash2, ImageIcon } from 'lucide-react-native';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
} from 'firebase/firestore';
import { db, storage } from '@/config/firebase';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/context/auth';

interface HairstyleEntry {
  id: string;
  name: string;
  imageUrl: string;
  gender: 'man' | 'woman' | 'unisex';
  serviceName: string;
  ownerId?: string;
}

const GENDER_OPTIONS: HairstyleEntry['gender'][] = ['man', 'woman', 'unisex'];

export default function HairstyleCatalogScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [entries, setEntries] = useState<HairstyleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [gender, setGender] = useState<HairstyleEntry['gender']>('unisex');
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const shopId = user?.uid;
      const baseQuery = shopId
        ? query(collection(db, 'hairstyleCatalog'), where('ownerId', '==', shopId))
        : collection(db, 'hairstyleCatalog');
      const snap = await getDocs(baseQuery as any);
      setEntries(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HairstyleEntry, 'id'>) }))
      );
    } catch (error) {
      console.error('Failed to load hairstyle catalog:', error);
      Alert.alert('Error', 'Failed to load your hairstyle gallery.');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Permission to access photos is required.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    try {
      setUploading(true);
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `hairstyle_${Date.now()}.jpg`;
      const storageRef = ref(storage, `hairstyle_catalog/${filename}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      setImageUrl(downloadURL);
    } catch (error: any) {
      console.error('Image upload failed:', error);
      Alert.alert('Error', 'Failed to upload image: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = async () => {
    if (!name.trim() || !imageUrl) {
      Alert.alert('Missing info', 'Please add a style name and photo.');
      return;
    }
    try {
      setSaving(true);
      await addDoc(collection(db, 'hairstyleCatalog'), {
        name: name.trim(),
        serviceName: serviceName.trim(),
        gender,
        imageUrl,
        ownerId: user?.uid ?? null,
        createdAt: new Date().toISOString(),
      });
      setName('');
      setServiceName('');
      setImageUrl('');
      setGender('unisex');
      setShowForm(false);
      fetchEntries();
    } catch (error) {
      console.error('Failed to save hairstyle:', error);
      Alert.alert('Error', 'Failed to save this style. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Remove style', 'Remove this style from the try-on gallery?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'hairstyleCatalog', id));
            setEntries((prev) => prev.filter((e) => e.id !== id));
          } catch (error) {
            console.error('Failed to delete style:', error);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <ArrowLeft size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>AI Try-On Gallery</Text>
        <TouchableOpacity onPress={() => setShowForm((v) => !v)} hitSlop={10}>
          <Plus size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <Text style={s.helperText}>
        Add reference photos for each hairstyle you offer. Customers will use these to preview the
        style on themselves with AI before booking.
      </Text>

      {showForm && (
        <View style={s.form}>
          <TouchableOpacity style={s.imagePickerBox} onPress={pickImage} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={Colors.primary} />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={s.previewImage} />
            ) : (
              <View style={s.imagePickerEmpty}>
                <ImageIcon size={28} color={Colors.textLight} />
                <Text style={s.imagePickerText}>Add reference photo</Text>
              </View>
            )}
          </TouchableOpacity>

          <TextInput
            style={s.input}
            placeholder="Style name (e.g. Textured Crop Fade)"
            value={name}
            onChangeText={setName}
            placeholderTextColor={Colors.textLight}
          />
          <TextInput
            style={s.input}
            placeholder="Matching service name in your menu (optional)"
            value={serviceName}
            onChangeText={setServiceName}
            placeholderTextColor={Colors.textLight}
          />

          <View style={s.genderRow}>
            {GENDER_OPTIONS.map((g) => (
              <TouchableOpacity
                key={g}
                style={[s.genderChip, gender === g && s.genderChipActive]}
                onPress={() => setGender(g)}
              >
                <Text style={[s.genderChipText, gender === g && s.genderChipTextActive]}>
                  {g === 'man' ? 'Men' : g === 'woman' ? 'Women' : 'Unisex'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[s.saveButton, saving && { opacity: 0.7 }]}
            onPress={handleAdd}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.saveButtonText}>Add to Gallery</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
      ) : entries.length === 0 ? (
        <Text style={s.emptyText}>No styles added yet. Tap + to add your first one.</Text>
      ) : (
        <View style={s.grid}>
          {entries.map((entry) => (
            <View key={entry.id} style={s.card}>
              <Image source={{ uri: entry.imageUrl }} style={s.cardImage} />
              <Text style={s.cardName} numberOfLines={1}>
                {entry.name}
              </Text>
              <Text style={s.cardGender}>{entry.gender}</Text>
              <TouchableOpacity style={s.deleteBadge} onPress={() => handleDelete(entry.id)}>
                <Trash2 size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  title: { fontSize: 18, fontFamily: 'Poppins-Bold', color: Colors.text },
  helperText: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  form: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.cardBackground,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 20,
  },
  imagePickerBox: {
    height: 160,
    borderRadius: 12,
    backgroundColor: Colors.inputBackground,
    marginBottom: 12,
    overflow: 'hidden',
  },
  imagePickerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  imagePickerText: { fontSize: 12, fontFamily: 'Poppins-Regular', color: Colors.textLight },
  previewImage: { width: '100%', height: '100%' },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: Colors.text,
    marginBottom: 10,
  },
  genderRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  genderChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.inputBackground,
  },
  genderChipActive: { backgroundColor: Colors.primary },
  genderChipText: { fontFamily: 'Poppins-Medium', fontSize: 12, color: Colors.text },
  genderChipTextActive: { color: '#fff' },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: { color: '#fff', fontFamily: 'Poppins-SemiBold', fontSize: 14 },
  emptyText: {
    textAlign: 'center',
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    marginTop: 32,
    paddingHorizontal: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12,
  },
  card: {
    width: '30%',
    backgroundColor: Colors.cardBackground,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardImage: { width: '100%', aspectRatio: 1 },
  cardName: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
    color: Colors.text,
    paddingHorizontal: 6,
    paddingTop: 4,
  },
  cardGender: {
    fontSize: 10,
    fontFamily: 'Poppins-Regular',
    color: Colors.textLight,
    paddingHorizontal: 6,
    paddingBottom: 6,
    textTransform: 'capitalize',
  },
  deleteBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(220,38,38,0.85)',
    borderRadius: 12,
    padding: 5,
  },
});
