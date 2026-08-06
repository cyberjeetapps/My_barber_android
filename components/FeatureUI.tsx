import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/Colors';

export function FeaturePage({ title, subtitle, children, loading=false }:{title:string;subtitle?:string;children:React.ReactNode;loading?:boolean}){
 const router=useRouter(); const insets=useSafeAreaInsets();
 return <View style={s.page}><View style={[s.header,{paddingTop:insets.top+12}]}><TouchableOpacity onPress={()=>router.back()}><ArrowLeft color={Colors.text}/></TouchableOpacity><View style={{flex:1}}><Text style={s.title}>{title}</Text>{subtitle?<Text style={s.subtitle}>{subtitle}</Text>:null}</View></View>{loading?<ActivityIndicator style={{marginTop:50}} color={Colors.primary}/>:<ScrollView contentContainerStyle={s.content}>{children}</ScrollView>}</View>
}
export function FeatureCard({title,description,onPress,badge}:{title:string;description:string;onPress?:()=>void;badge?:string}){
 return <TouchableOpacity disabled={!onPress} onPress={onPress} style={s.card}><View style={{flex:1}}><View style={s.row}><Text style={s.cardTitle}>{title}</Text>{badge?<Text style={s.badge}>{badge}</Text>:null}</View><Text style={s.desc}>{description}</Text></View>{onPress?<ChevronRight size={20} color={Colors.textLight}/>:null}</TouchableOpacity>
}
export function Pill({label,active,onPress}:{label:string;active?:boolean;onPress:()=>void}){return <TouchableOpacity onPress={onPress} style={[s.pill,active&&s.pillActive]}><Text style={[s.pillText,active&&s.pillTextActive]}>{label}</Text></TouchableOpacity>}
const s=StyleSheet.create({page:{flex:1,backgroundColor:Colors.background},header:{paddingHorizontal:18,paddingBottom:14,flexDirection:'row',gap:14,alignItems:'center',borderBottomWidth:1,borderBottomColor:Colors.border},title:{fontSize:21,fontWeight:'800',color:Colors.text},subtitle:{fontSize:12,color:Colors.textLight,marginTop:2},content:{padding:18,paddingBottom:60},card:{backgroundColor:'#fff',borderWidth:1,borderColor:Colors.border,borderRadius:16,padding:16,marginBottom:12,flexDirection:'row',alignItems:'center',gap:10},cardTitle:{fontSize:16,fontWeight:'700',color:Colors.text},desc:{fontSize:13,color:Colors.textLight,marginTop:5,lineHeight:19},row:{flexDirection:'row',alignItems:'center',gap:8},badge:{fontSize:10,fontWeight:'700',color:Colors.primary,backgroundColor:'#eef4ff',paddingHorizontal:8,paddingVertical:3,borderRadius:12},pill:{paddingHorizontal:12,paddingVertical:8,borderRadius:18,borderWidth:1,borderColor:Colors.border,marginRight:8,marginBottom:8},pillActive:{backgroundColor:Colors.primary,borderColor:Colors.primary},pillText:{fontSize:12,color:Colors.text},pillTextActive:{color:'#fff',fontWeight:'700'}});
