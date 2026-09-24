import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ShoppingBag } from 'lucide-react-native';
import Colors from '@/constants/Colors';

export default function ShoppingScreen() {
  return <View style={styles.container} accessible accessibilityLabel="Shopping tab">
    <ShoppingBag size={52} color={Colors.primary} accessibilityElementsHidden />
    <Text style={styles.title}>Shopping</Text>
    <Text style={styles.subtitle}>Products and marketplace features will appear here in a future release.</Text>
  </View>;
}
const styles=StyleSheet.create({container:{flex:1,alignItems:'center',justifyContent:'center',padding:32,backgroundColor:Colors.background},title:{fontSize:24,fontWeight:'700',color:Colors.text,marginTop:16},subtitle:{fontSize:15,color:Colors.textLight,textAlign:'center',marginTop:8,lineHeight:22}});
