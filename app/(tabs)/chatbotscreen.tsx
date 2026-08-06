import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ActivityIndicator,
  SafeAreaView,
  Keyboard,
  ScrollView
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { db } from '@/config/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const ChatbotScreen = () => {
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allShops, setAllShops] = useState<any[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const flatListRef = useRef<any>(null);

  useEffect(() => {
    setMessages([
      {
        id: '1',
        text: 'Hi there! I\'m your barbershop assistant. I can help you with:\n• Our services\n• Packages\n• Shop locations\n• Current offers\n• Booking a service by name',
        sender: 'bot',
        timestamp: new Date().toISOString(),
      },
    ]);
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setIsLoading(true);
    try {
      // Fetch shops data
      const shopsQuery = query(collection(db, 'shops'), orderBy('shopName'));
      const shopsSnapshot = await getDocs(shopsQuery);
      const shopsData = shopsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      setAllShops(shopsData);
      
      // Fetch services data
      const servicesQuery = query(collection(db, 'services'), orderBy('name'));
      const servicesSnapshot = await getDocs(servicesQuery);
      const servicesData = servicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      setServices(servicesData);

      // Fetch packages data
      const packagesQuery = query(collection(db, 'packages'), orderBy('name'));
      const packagesSnapshot = await getDocs(packagesQuery);
      const packagesData = packagesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as any)
      }));
      setPackages(packagesData);

      // Fetch offers with enhanced data including shop and service names
      const offersQuery = query(collection(db, 'offers'), where('status', '==', 'approved'), orderBy('title'));
      const offersSnapshot = await getDocs(offersQuery);
      
      // Create a map of shops and services for quick lookup
      const shopMap = {};
      shopsData.forEach(shop => {
        shopMap[shop.id] = shop.shopName;
      });
      
      const serviceMap = {};
      servicesData.forEach(service => {
        serviceMap[service.id] = service.name;
      });

      // Process offers with shop and service names
      const offersData = offersSnapshot.docs.map(doc => {
        const data = doc.data();
        const shopNames = data.shops ? data.shops.map(shopId => shopMap[shopId]).filter(Boolean) : [];
        const serviceNames = data.services ? data.services.map(serviceId => serviceMap[serviceId]).filter(Boolean) : [];
        
        return {
          id: doc.id,
          ...data,
          shopNames,
          serviceNames,
          createdAt: safeConvertToDate(data.createdAt),
          validUntil: data.validUntil ? safeConvertToDate(data.validUntil) : null
        };
      });

      setOffers(offersData);

    } catch (error) {
      console.error('Error loading data:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Sorry, I'm having trouble loading some data. Please try again later.",
        sender: 'bot',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const safeConvertToDate = (dateValue) => {
    if (!dateValue) return null;
    if (dateValue.toDate) return dateValue.toDate();
    if (dateValue instanceof Date) return dateValue;
    return new Date(dateValue);
  };

  const handleSend = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      id: Date.now().toString(),
      text: inputMessage,
      sender: 'user',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      if (isGreeting(inputMessage)) {
        const greetingResponse = {
          id: (Date.now() + 1).toString(),
          text: "Hello! I can help you with:\n• Our services\n• Packages\n• Shop locations\n• Current offers",
          sender: 'bot',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, greetingResponse]);
        return;
      }

      if (isHelpRequest(inputMessage)) {
        const helpResponse = {
          id: (Date.now() + 1).toString(),
          text: "I can help with:\n\n🔹 Services: Ask about haircuts, shaves, etc.\n🔹 Packages: Ask about bundled services\n🔹 Shops: Locations and hours\n🔹 Offers: Current discounts\n🔹 Booking: Say 'book a haircut' and I'll take you to the booking screen\n\nTry asking:\n• 'What services do you offer?'\n• 'Where are your locations?'\n• 'Show me current offers'\n• 'What packages are available?'\n• 'Book a haircut'",
          sender: 'bot',
          timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, helpResponse]);
        return;
      }

      const response = await generateResponse(inputMessage);
      
      const botMessage = {
        id: (Date.now() + 1).toString(),
        text: response?.text || "I can only provide information about services, packages, shop locations, and current offers. Please ask about those topics.",
        actions: response?.actions,
        sender: 'bot',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error generating response:', error);
      const errorResponse = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I encountered an error. Please try again later.",
        sender: 'bot',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const isGreeting = (message) => {
    const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    return greetings.some(greet => message.toLowerCase().includes(greet));
  };

  const isHelpRequest = (message) => {
    const helpPhrases = ['help', 'what can you do', 'options', 'commands', 'features'];
    return helpPhrases.some(phrase => message.toLowerCase().includes(phrase));
  };

  // Booking intent is only ever used to find candidate services and hand
  // the customer to the real booking screen — the chatbot never creates,
  // confirms, or pays for a booking itself. That keeps slot validation,
  // terms confirmation, Razorpay, and owner notifications all going
  // through the one existing path.
  const isBookingRequest = (message) => {
    const bookingPhrases = ['book', 'appointment', 'reserve', 'schedule', 'slot'];
    return bookingPhrases.some(phrase => message.toLowerCase().includes(phrase));
  };

  // Finds services whose name appears in the customer's message, and
  // returns one bookable action per shop that offers it (capped so the
  // chat doesn't fill up with dozens of buttons for a common service).
  const findBookableMatches = (message) => {
    const lowerMessage = message.toLowerCase();
    const matchedServices = services.filter(
      (service) => service.name && lowerMessage.includes(service.name.toLowerCase())
    );

    const actions: any[] = [];
    matchedServices.forEach((service) => {
      (service.shops || []).forEach((shopId) => {
        if (actions.length >= 3) return;
        const shop = allShops.find((s) => s.id === shopId);
        actions.push({
          label: `Book ${service.name}${shop ? ` at ${shop.shopName}` : ''}`,
          serviceId: service.id,
          shopId,
        });
      });
    });
    return actions;
  };

  const formatShopResponse = (shops) => {
    if (shops.length === 0) return "No shop locations found.";
    
    let response = "🏪 Our Shop Locations:\n\n";
    shops.forEach((shop, index) => {
      response += `📍 ${shop.shopName || `Shop ${index + 1}`}\n`;
      response += `   ${shop.addressLine1 || ''}`;
      if (shop.addressLine2) response += `, ${shop.addressLine2}`;
      if (shop.city) response += `, ${shop.city}`;
      if (shop.state) response += `, ${shop.state}`;
      if (shop.country) response += `, ${shop.country}`;
      response += `\n   📞 ${shop.contactNumber || 'Phone not listed'}\n`;
      response += `   🕒 ${shop.openingHours || '9:00 AM - 7:00 PM'}\n`;
      
      if (shop.socialMedia) {
        response += `   🌐 Social: `;
        const socials: any[] = [];
        if (shop.socialMedia.instagram) socials.push(`Instagram: ${shop.socialMedia.instagram}`);
        if (shop.socialMedia.facebook) socials.push(`Facebook: ${shop.socialMedia.facebook}`);
        response += socials.join(' | ') + '\n';
      }
      response += '\n';
    });
    return response;
  };

  const formatServiceResponse = (services) => {
    if (services.length === 0) return "No services available currently.";
    
    let response = "✂️ Our Services:\n\n";
    services.forEach(service => {
      response += `✨ ${service.name} - ₹${service.price}\n`;
      if (service.description) response += `   ${service.description}\n`;
      if (service.duration) response += `   ⏱️ ${service.duration} mins\n`;
      if (service.shops && allShops.length > 0) {
        const shopNames = service.shops.map(shopId => {
          const shop = allShops.find(s => s.id === shopId);
          return shop ? shop.shopName : null;
        }).filter(Boolean);
        if (shopNames.length > 0) {
          response += `   🏠 Available at: ${shopNames.join(', ')}\n`;
        }
      }
      response += '\n';
    });
    return response;
  };

  const formatPackageResponse = (packages) => {
    if (packages.length === 0) return "No packages available currently.";
    
    let response = "🎁 Our Packages:\n\n";
    packages.forEach(pkg => {
      response += `🌟 ${pkg.name} - ₹${pkg.price}\n`;
      if (pkg.description) response += `   ${pkg.description}\n`;
      if (pkg.duration) response += `   ⏱️ ${pkg.duration} mins\n`;
      if (pkg.services && services.length > 0) {
        const serviceNames = pkg.services.map(serviceId => {
          const service = services.find(s => s.id === serviceId);
          return service ? service.name : null;
        }).filter(Boolean);
        if (serviceNames.length > 0) {
          response += `   ✅ Includes: ${serviceNames.join(', ')}\n`;
        }
      }
      if (pkg.shops && allShops.length > 0) {
        const shopNames = pkg.shops.map(shopId => {
          const shop = allShops.find(s => s.id === shopId);
          return shop ? shop.shopName : null;
        }).filter(Boolean);
        if (shopNames.length > 0) {
          response += `   🏠 Available at: ${shopNames.join(', ')}\n`;
        }
      }
      response += '\n';
    });
    return response;
  };

  const formatOfferResponse = (offers) => {
    if (offers.length === 0) return "No current offers available.";
    
    let response = "🎉 Current Offers:\n\n";
    offers.forEach((offer, index) => {
      response += `🔥 ${offer.title}\n`;
      response += `   💰 Discount: ${offer.discount}%\n`;
      response += `✨ ${offer.serviceName}\n`;
      response += `✨ ${offer.shopName}\n`;
      
      // Format price if available
      if (offer.discountedPrice) {
        response += `   💵 Price: ₹${offer.discountedPrice}`;
        if (offer.originalPrice) {
          response += ` (was ₹${offer.originalPrice})`;
        }
        response += '\n';
      }
      
      // Format valid until date
      if (offer.validUntil) {
        response += `   ⏳ Valid until: ${offer.validUntil.toLocaleDateString()}\n`;
      } else {
        response += `   ⏳ No expiration date\n`;
      }
      
     
      
   
      
      // Show terms if available
      if (offer.terms) {
        response += `   📝 Terms: ${offer.terms}\n`;
      }
      
      // Show description if available
      if (offer.description) {
        response += `   ℹ️ ${offer.description}\n`;
      }
      
      response += '\n';
    });
    return response;
  };

  const generateResponse = async (userQuery) => {
    const lowerQuery = userQuery.toLowerCase();

    if (isBookingRequest(userQuery)) {
      const actions = findBookableMatches(userQuery);
      if (actions.length > 0) {
        return {
          text: `Found ${actions.length > 1 ? 'a few options' : 'this'} for you. Tapping a button below takes you to the normal booking screen — you'll still pick the date, time, and payment there.`,
          actions,
        };
      }
      return {
        text: "I couldn't match that to a specific service by name — try naming it exactly (e.g. \"book a haircut\"), or browse everything available.",
        actions: [{ label: 'Browse Services', route: '/services' }],
      };
    }

    if (lowerQuery.includes('shop') || lowerQuery.includes('location') || lowerQuery.includes('address')) {
      return { text: formatShopResponse(allShops) };
    }
    
    if (lowerQuery.includes('service') || lowerQuery.includes('price') || lowerQuery.includes('menu')) {
      return { text: formatServiceResponse(services) };
    }
    
    if (lowerQuery.includes('package') || lowerQuery.includes('bundle') || lowerQuery.includes('deal')) {
      return { text: formatPackageResponse(packages) };
    }
    
    if (lowerQuery.includes('offer') || lowerQuery.includes('discount') || lowerQuery.includes('promo')) {
      return { text: formatOfferResponse(offers) };
    }
    
    if (lowerQuery.includes('hour') || lowerQuery.includes('open') || lowerQuery.includes('time')) {
      if (allShops.length > 0 && allShops[0].openingHours) {
        return { text: `🕒 Business Hours:\n${allShops[0].openingHours}` };
      }
      return { text: "🕒 Our standard hours are 9:00 AM to 7:00 PM." };
    }
    
    return { text: "I can only provide information about:\n• Our services and prices\n• Packages\n• Shop locations\n• Current offers\n\nTry something like 'What services do you offer?' or 'Where are your locations?'" };
  };

  const renderMessage = ({ item }) => {
    return (
      <View style={[
        styles.messageContainer,
        item.sender === 'user' ? styles.userMessage : styles.botMessage
      ]}>
        <Text style={[
          styles.messageText,
          item.sender === 'user' ? styles.userMessageText : styles.botMessageText
        ]}>
          {item.text}
        </Text>
        {Array.isArray(item.actions) && item.actions.length > 0 && (
          <View style={styles.actionsRow}>
            {item.actions.map((action, i) => (
              <TouchableOpacity
                key={i}
                style={styles.actionButton}
                onPress={() =>
                  action.route
                    ? router.push(action.route)
                    : router.push({
                        pathname: '/services',
                        params: { rebook: '1', serviceId: action.serviceId, shopId: action.shopId },
                      })
                }
                accessibilityRole="button"
              >
                <Text style={styles.actionButtonText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={[
          styles.timestamp,
          item.sender === 'user' ? styles.userTimestamp : styles.botTimestamp
        ]}>
          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
        keyboardVerticalOffset={Platform.select({ ios: 90, android: 0 })}
      >
        <View style={styles.innerContainer}>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            keyboardDismissMode="on-drag" // Add this line
            keyboardShouldPersistTaps="handled" // Add this line
          />
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputMessage}
              onChangeText={setInputMessage}
              placeholder="Type your question..."
              placeholderTextColor="#999"
              onSubmitEditing={handleSend}
              editable={!isLoading}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                isLoading && styles.disabledButton
              ]}
              onPress={handleSend}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Feather name="send" size={20} color="white" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 80,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginTop:40,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 0,
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderBottomLeftRadius: 0,
    borderWidth: 1,
    borderColor: '#e5e5ea',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  botMessageText: {
    color: '#333',
  },
  timestamp: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  actionsRow: {
    marginTop: 8,
    gap: 6,
  },
  actionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  userTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  botTimestamp: {
    color: '#999',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 24,
    marginRight: 8,
    fontSize: 16,
    maxHeight: 120,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default ChatbotScreen;