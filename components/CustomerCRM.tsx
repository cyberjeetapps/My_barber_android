import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Search, UserRound, IndianRupee, CalendarDays, Users, Gift, Award } from 'lucide-react-native';
import { collection, doc, getDoc, getDocs, increment, limit, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/context/auth';
import Colors from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Booking = { userId?: string; userName?: string; userPhone?: string; dateTime?: string; amount?: number; totalAmount?: number; price?: number; status?: string; shopId?: string };
type Customer = { id: string; name: string; phone: string; email: string; visits: number; totalSpend: number; lastVisit?: Date; segment: 'New'|'Repeat'|'VIP'|'Lapsed'; rewardPoints: number; goldTier: boolean; freeServiceCredits: number };

const chunk = <T,>(items: T[], size = 30) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const money = (v:number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

export default function CustomerCRM({ scope }: { scope: 'owner'|'admin' }) {
  const router = useRouter(); const insets = useSafeAreaInsets(); const { user } = useAuth();
  const [customers,setCustomers]=useState<Customer[]>([]); const [loading,setLoading]=useState(true); const [refreshing,setRefreshing]=useState(false); const [search,setSearch]=useState(''); const [segment,setSegment]=useState('All');
  const [allocating,setAllocating]=useState<string|null>(null);

  const load = useCallback(async()=>{
    if(!user?.uid) return;
    try {
      const shopIds:string[]=[];
      if(scope==='owner') {
        const shops=await getDocs(query(collection(db,'shops'),where('ownerId','==',user.uid),limit(30)));
        shops.forEach(s=>shopIds.push(s.id));
        if(!shopIds.length){ setCustomers([]); return; }
      }
      const bookings:Booking[]=[];
      for(const collectionName of ['appointments','familybookings']) {
        if(scope==='admin') {
          const snap=await getDocs(query(collection(db,collectionName),limit(500)));
          snap.forEach(d=>bookings.push(d.data() as Booking));
        } else {
          for(const ids of chunk(shopIds)) {
            const snap=await getDocs(query(collection(db,collectionName),where('shopId','in',ids),limit(500)));
            snap.forEach(d=>bookings.push(d.data() as Booking));
          }
        }
      }
      const grouped=new Map<string,Booking[]>();
      bookings.filter(b=>b.userId && b.status!=='cancelled').forEach(b=>grouped.set(b.userId!,[...(grouped.get(b.userId!)||[]),b]));
      const now=Date.now();
      const result=await Promise.all([...grouped.entries()].slice(0,300).map(async([id,items])=>{
        const profile=await getDoc(doc(db,'users',id)); const p=profile.exists()?profile.data():{};
        const dates=items.map(x=>new Date(x.dateTime||0)).filter(x=>!Number.isNaN(x.getTime())).sort((a,b)=>b.getTime()-a.getTime());
        const spend=items.reduce((s,x)=>s+Number(x.totalAmount||x.amount||x.price||0),0); const days=dates[0]?Math.floor((now-dates[0].getTime())/86400000):9999;
        const seg:Customer['segment']=spend>=5000||items.length>=10?'VIP':days>60?'Lapsed':items.length>1?'Repeat':'New';
        return {id,name:p.name||items[0]?.userName||'Customer',phone:p.phone||items[0]?.userPhone||'',email:p.email||'',visits:items.length,totalSpend:spend,lastVisit:dates[0],segment:seg,rewardPoints:p.rewardPoints||0,goldTier:!!p.goldTierGranted,freeServiceCredits:p.freeServiceCredits||0};
      }));
      setCustomers(result.sort((a,b)=>b.totalSpend-a.totalSpend));
    } finally { setLoading(false); setRefreshing(false); }
  },[scope,user?.uid]);
  useEffect(()=>{load()},[load]);
  const filtered=useMemo(()=>customers.filter(c=>(segment==='All'||c.segment===segment)&&`${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(search.toLowerCase())),[customers,segment,search]);
  const metrics=useMemo(()=>({total:customers.length,repeat:customers.filter(c=>c.visits>1).length,value:customers.reduce((s,c)=>s+c.totalSpend,0)}),[customers]);

  const allocateFreeService = async (customerId: string) => {
    setAllocating(customerId);
    try {
      await updateDoc(doc(db,'users',customerId), { freeServiceCredits: increment(1) });
      setCustomers(prev=>prev.map(c=>c.id===customerId?{...c,freeServiceCredits:c.freeServiceCredits+1}:c));
    } catch (err) {
      console.warn('Failed to allocate free service:', err);
    } finally {
      setAllocating(null);
    }
  };

  return <View style={styles.page}>
    <View style={[styles.header,{paddingTop:insets.top+12}]}><TouchableOpacity onPress={()=>router.back()} style={styles.back}><ArrowLeft size={22} color={Colors.text}/></TouchableOpacity><View><Text style={styles.title}>Customer CRM</Text><Text style={styles.subtitle}>Retention, value and visit history</Text></View></View>
    <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.metrics}><Metric icon={<Users size={20} color={Colors.primary}/>} label="Customers" value={String(metrics.total)}/><Metric icon={<UserRound size={20} color={Colors.primary}/>} label="Repeat" value={String(metrics.repeat)}/><Metric icon={<IndianRupee size={20} color={Colors.primary}/>} label="Lifetime value" value={money(metrics.value)}/></View>
      <View style={styles.search}><Search size={18} color={Colors.textLight}/><TextInput value={search} onChangeText={setSearch} placeholder="Search name, phone or email" placeholderTextColor={Colors.textLight} style={styles.input}/></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{['All','New','Repeat','VIP','Lapsed'].map(x=><TouchableOpacity key={x} onPress={()=>setSegment(x)} style={[styles.chip,segment===x&&styles.chipActive]}><Text style={[styles.chipText,segment===x&&styles.chipTextActive]}>{x}</Text></TouchableOpacity>)}</ScrollView>
      {loading?<ActivityIndicator style={{marginTop:50}} size="large" color={Colors.primary}/>:filtered.length===0?<Text style={styles.empty}>No customers found.</Text>:filtered.map(c=><View key={c.id} style={styles.card}><View style={styles.avatar}><Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text></View><View style={{flex:1}}><View style={styles.row}><Text style={styles.name}>{c.name}</Text><Text style={styles.badge}>{c.segment}</Text></View><Text style={styles.contact}>{c.phone||c.email||'Contact unavailable'}</Text><View style={styles.detailRow}><Text style={styles.detail}>{c.visits} visits</Text><Text style={styles.detail}>{money(c.totalSpend)}</Text><Text style={styles.detail}>{c.lastVisit?c.lastVisit.toLocaleDateString('en-IN'):'No date'}</Text></View>
        {(c.rewardPoints>0||c.goldTier||c.freeServiceCredits>0) && <View style={styles.rewardRow}>
          <Text style={styles.rewardText}>{c.rewardPoints} pts</Text>
          {c.goldTier && <View style={styles.goldChip}><Award size={11} color="#7a5c00"/><Text style={styles.goldChipText}>GOLD</Text></View>}
          {c.freeServiceCredits>0 && <Text style={styles.rewardText}>🎁 {c.freeServiceCredits} free service{c.freeServiceCredits===1?'':'s'}</Text>}
        </View>}
        {scope==='admin' && <TouchableOpacity style={styles.allocateButton} onPress={()=>allocateFreeService(c.id)} disabled={allocating===c.id}>
          {allocating===c.id ? <ActivityIndicator size="small" color={Colors.primary}/> : <><Gift size={13} color={Colors.primary}/><Text style={styles.allocateButtonText}>Allocate free service</Text></>}
        </TouchableOpacity>}
      </View></View>)}
    </ScrollView>
  </View>
}
function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <View style={styles.metric}>{icon}<Text style={styles.metricValue} numberOfLines={1}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:Colors.background},header:{paddingHorizontal:20,paddingBottom:16,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:Colors.border},back:{width:40,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',marginRight:10},title:{fontFamily:'Poppins-Bold',fontSize:24,color:Colors.text},subtitle:{fontFamily:'Poppins-Regular',fontSize:13,color:Colors.textLight},content:{padding:16,paddingBottom:40},metrics:{flexDirection:'row',gap:10},metric:{flex:1,minWidth:0,backgroundColor:Colors.cardBackground,padding:12,borderRadius:14,borderWidth:1,borderColor:Colors.border},metricValue:{fontFamily:'Poppins-Bold',fontSize:17,color:Colors.text,marginTop:8},metricLabel:{fontFamily:'Poppins-Regular',fontSize:11,color:Colors.textLight},search:{marginTop:16,backgroundColor:Colors.cardBackground,borderRadius:12,borderWidth:1,borderColor:Colors.border,flexDirection:'row',alignItems:'center',paddingHorizontal:14},input:{flex:1,paddingVertical:13,paddingHorizontal:10,fontFamily:'Poppins-Regular',color:Colors.text},filters:{gap:8,paddingVertical:14},chip:{paddingHorizontal:16,paddingVertical:8,borderRadius:20,backgroundColor:Colors.cardBackground,borderWidth:1,borderColor:Colors.border},chipActive:{backgroundColor:Colors.primary,borderColor:Colors.primary},chipText:{fontFamily:'Poppins-Medium',fontSize:13,color:Colors.text},chipTextActive:{color:'#fff'},card:{backgroundColor:Colors.cardBackground,borderRadius:14,padding:14,marginBottom:10,flexDirection:'row',borderWidth:1,borderColor:Colors.border},avatar:{width:44,height:44,borderRadius:22,backgroundColor:Colors.primaryLight,alignItems:'center',justifyContent:'center',marginRight:12},avatarText:{fontFamily:'Poppins-Bold',fontSize:18,color:Colors.primary},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},name:{fontFamily:'Poppins-SemiBold',fontSize:15,color:Colors.text,flex:1},badge:{fontFamily:'Poppins-Medium',fontSize:10,color:Colors.primary,backgroundColor:Colors.primaryLight,paddingHorizontal:8,paddingVertical:4,borderRadius:12},contact:{fontFamily:'Poppins-Regular',fontSize:12,color:Colors.textLight,marginTop:2},detailRow:{flexDirection:'row',gap:12,marginTop:8},detail:{fontFamily:'Poppins-Medium',fontSize:11,color:Colors.text},empty:{textAlign:'center',marginTop:50,fontFamily:'Poppins-Regular',color:Colors.textLight},rewardRow:{flexDirection:'row',alignItems:'center',gap:8,marginTop:8},rewardText:{fontFamily:'Poppins-Medium',fontSize:11,color:Colors.text},goldChip:{flexDirection:'row',alignItems:'center',gap:3,backgroundColor:'#fff8e1',paddingHorizontal:7,paddingVertical:3,borderRadius:8},goldChipText:{fontFamily:'Poppins-Bold',fontSize:9,color:'#7a5c00'},allocateButton:{flexDirection:'row',alignItems:'center',gap:6,marginTop:10,alignSelf:'flex-start',borderWidth:1,borderColor:Colors.border,borderRadius:10,paddingHorizontal:10,paddingVertical:7},allocateButtonText:{fontFamily:'Poppins-Medium',fontSize:11,color:Colors.text}});

