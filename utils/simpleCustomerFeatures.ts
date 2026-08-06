import { Alert, Linking, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

export type CustomerAppointment = {
  id?: string;
  dateTime?: Date | string;
  serviceName?: string;
  shopName?: string;
  shopLocation?: string;
  servicePrice?: number;
  totalPrice?: number;
  paymentStatus?: string;
  paymentMethod?: string;
  barberNumber?: number;
  userName?: string;
  barberName?: string;
  addOnServices?: any[];
};

const asDate = (value?: Date | string) => {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
};

export function buildReferralCode(uid?: string) {
  if (!uid) return '';
  const compact = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `MB${compact.slice(0, 8)}`;
}

export async function openShopDirections(shop: {
  shopName?: string;
  shopLocation?: string;
  googleMapLink?: string;
  latitude?: number | string;
  longitude?: number | string;
}) {
  const lat = Number(shop.latitude);
  const lng = Number(shop.longitude);
  const label = encodeURIComponent(shop.shopName || 'Barber shop');
  const address = encodeURIComponent(shop.shopLocation || shop.shopName || '');

  let url = shop.googleMapLink || '';
  if (!url && Number.isFinite(lat) && Number.isFinite(lng)) {
    url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?ll=${lat},${lng}&q=${label}`
      : `geo:${lat},${lng}?q=${lat},${lng}(${label})`;
  }
  if (!url) {
    url = `https://www.google.com/maps/search/?api=1&query=${address || label}`;
  }

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Directions unavailable', 'We could not open a maps application on this device.');
  }
}

export async function addAppointmentToCalendar(appointment: CustomerAppointment) {
  const start = asDate(appointment.dateTime);
  if (!start) {
    Alert.alert('Calendar unavailable', 'This appointment does not have a valid date and time.');
    return;
  }

  const title = encodeURIComponent(`${appointment.serviceName || 'Appointment'} at ${appointment.shopName || 'MyBarber'}`);
  const startMs = start.getTime();

  // Opens the device calendar at the booked time without changing backend data.
  const url = Platform.OS === 'ios'
    ? `calshow:${Math.floor(startMs / 1000)}`
    : `content://com.android.calendar/time/${startMs}`;

  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(
      'Calendar unavailable',
      `Please add ${decodeURIComponent(title)} on ${start.toLocaleString()} to your calendar.`
    );
  }
}

export function isShopOpenNow(openingHours?: string, now = new Date()) {
  if (!openingHours) return false;
  const normalized = openingHours.trim().toLowerCase();
  if (normalized.includes('24 hour') || normalized === '24/7') return true;
  if (normalized.includes('closed')) return false;

  const matches = [...normalized.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/g)];
  if (matches.length < 2) return false;

  const toMinutes = (match: RegExpMatchArray) => {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3];
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
  };

  const open = toMinutes(matches[0]);
  const close = toMinutes(matches[1]);
  const current = now.getHours() * 60 + now.getMinutes();
  return close >= open ? current >= open && current <= close : current >= open || current <= close;
}

export async function shareBookingReceipt(appointment: CustomerAppointment) {
  const date = asDate(appointment.dateTime);
  const amount = appointment.totalPrice ?? appointment.servicePrice ?? 0;
  const reference = appointment.id ? appointment.id.slice(0, 10).toUpperCase() : 'MYBARBER';
  
  const paymentMethod = (appointment.paymentStatus || appointment.paymentMethod || 'pending').toUpperCase();
  const dateStr = date ? date.toLocaleString() : '-';
  const serviceName = appointment.serviceName || 'Service';
  const shopName = appointment.shopName || 'MyBarber partner shop';
  const barberText = appointment.barberName 
    ? appointment.barberName 
    : (appointment.barberNumber ? `Barber #${appointment.barberNumber}` : 'Assigned Barber');
  const customerName = appointment.userName || 'Customer';

  let addOnsHtml = '';
  if (appointment.addOnServices && appointment.addOnServices.length > 0) {
    appointment.addOnServices.forEach(addon => {
      addOnsHtml += `
        <div class="row">
          <span class="label" style="padding-left: 15px;">+ ${addon.serviceName || addon.name || 'Add-on'}</span>
          <span class="value">₹${Number(addon.servicePrice ?? addon.price ?? 0).toFixed(2)}</span>
        </div>
      `;
    });
  }

  const htmlContent = `
    <!doctype html>
    <html>
      <head>
        <title>MyBarber Booking Confirmation</title>
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <style>
          body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 40px; color: #111827; background-color: #f9fafb; }
          .card { max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 40px; background-color: white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #f3f4f6; padding-bottom: 20px; }
          .header h1 { font-size: 28px; margin: 0; color: #1f2937; letter-spacing: -0.5px; }
          .header p { color: #6b7280; margin: 8px 0 0 0; font-size: 15px; }
          .section-title { font-size: 18px; font-weight: 600; color: #374151; margin: 25px 0 15px 0; border-left: 4px solid #3b82f6; padding-left: 10px; }
          .row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed #e5e7eb; }
          .row:last-child { border-bottom: none; }
          .label { color: #6b7280; font-size: 15px; font-weight: 500; }
          .value { text-align: right; font-weight: 600; font-size: 15px; color: #111827; }
          .total-row { display: flex; justify-content: space-between; align-items: center; padding: 20px 0 0 0; margin-top: 20px; border-top: 2px solid #f3f4f6; }
          .total-label { font-size: 18px; font-weight: 700; color: #1f2937; }
          .total-value { font-size: 24px; font-weight: 800; color: #3b82f6; }
          .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 14px; }
          .status-badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 700; background-color: #dbeafe; color: #1d4ed8; }
          .status-paid { background-color: #d1fae5; color: #047857; }
          .status-pending { background-color: #fef3c7; color: #b45309; }
          @media print { body { padding: 0; background-color: white; } .card { box-shadow: none; border: none; padding: 0; } }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1>MyBarber</h1>
            <p>Booking Confirmation Receipt</p>
          </div>
          
          <div class="row">
            <span class="label">Reference No.</span>
            <span class="value" style="font-family: monospace; letter-spacing: 1px;">${reference}</span>
          </div>
          <div class="row">
            <span class="label">Date & Time</span>
            <span class="value">${dateStr}</span>
          </div>
          <div class="row">
            <span class="label">Customer</span>
            <span class="value">${customerName}</span>
          </div>

          <div class="section-title">Shop Details</div>
          <div class="row">
            <span class="label">Shop Name</span>
            <span class="value">${shopName}</span>
          </div>
          ${appointment.shopLocation ? `<div class="row"><span class="label">Location</span><span class="value" style="max-width: 60%; text-align: right;">${appointment.shopLocation}</span></div>` : ''}
          <div class="row">
            <span class="label">Assigned Professional</span>
            <span class="value">${barberText}</span>
          </div>

          <div class="section-title">Service Details</div>
          <div class="row">
            <span class="label">${serviceName}</span>
            <span class="value">₹${Number(appointment.servicePrice ?? 0).toFixed(2)}</span>
          </div>
          ${addOnsHtml}

          <div class="section-title">Payment Information</div>
          <div class="row">
            <span class="label">Payment Method</span>
            <span class="value">${paymentMethod}</span>
          </div>
          <div class="row">
            <span class="label">Status</span>
            <span class="status-badge ${paymentMethod === 'PAID' ? 'status-paid' : (paymentMethod === 'ONLINE' ? 'status-paid' : 'status-pending')}">${paymentMethod}</span>
          </div>
          
          <div class="total-row">
            <span class="total-label">Total Amount</span>
            <span class="total-value">₹${Number(amount).toFixed(2)}</span>
          </div>

          <div class="footer">
            Thank you for choosing MyBarber!<br/>
            Please show this receipt at the shop if requested.
          </div>
        </div>
      </body>
    </html>
  `;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const popup = window.open('', '_blank', 'width=720,height=900');
    if (popup) {
      popup.document.write(htmlContent + '<script>window.onload=()=>window.print()</script>');
      popup.document.close();
      return;
    }
  }

  try {
    const { uri } = await Print.printToFileAsync({
      html: htmlContent,
      base64: false
    });
    
    if (Platform.OS === 'android') {
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (permissions.granted) {
        const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, `Receipt_${reference}.pdf`, 'application/pdf');
        await FileSystem.writeAsStringAsync(newUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
        Alert.alert('Success', 'Receipt saved successfully to your device.');
      } else {
        // Fallback to sharing if permission denied
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Share your booking confirmation', UTI: 'com.adobe.pdf' });
        }
      }
    } else {
      // iOS
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share or Save your booking confirmation',
          UTI: 'com.adobe.pdf'
        });
      } else {
        Alert.alert('Sharing unavailable', 'Cannot share PDF on this device.');
      }
    }
  } catch (error) {
    console.error('Error generating PDF:', error);
    Alert.alert('Error', 'Failed to generate PDF receipt.');
  }
}
