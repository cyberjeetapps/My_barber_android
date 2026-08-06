import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Real appointment reminders — replaces the old logic that only fired an
// "immediate" notification if the customer happened to have the app open
// within an hour of their booking (and only ever for one appointment,
// ever, per app session). That version reduced zero no-shows, since it
// never actually reached anyone who wasn't already looking at the app.
//
// This schedules genuine future-dated local notifications (24h and 1h
// before), for every upcoming individual and family booking, and re-runs
// safely every time the appointment list refreshes — same identifier in,
// same identifier out, so nothing gets double-booked.

type ReminderAppointment = {
  id: string;
  dateTime: Date;
  serviceName?: string;
  shopName?: string;
  isFamilyBooking?: boolean;
};

const REMINDER_OFFSETS_MINUTES = [24 * 60, 60]; // 24h before, 1h before

const reminderId = (appointmentId: string, offsetMinutes: number) =>
  `appt-reminder-${appointmentId}-${offsetMinutes}`;

const isSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export async function scheduleAppointmentReminders(appointment: ReminderAppointment) {
  if (!isSupported) return;

  for (const offsetMinutes of REMINDER_OFFSETS_MINUTES) {
    const id = reminderId(appointment.id, offsetMinutes);
    const fireDate = new Date(appointment.dateTime.getTime() - offsetMinutes * 60 * 1000);

    // Skip anything already in the past — no point scheduling a reminder
    // for a time that's already gone (e.g. booking made same-day, inside
    // the 24h window).
    if (fireDate.getTime() <= Date.now()) continue;

    // Re-scheduling with the same identifier replaces any previous
    // reminder for this exact appointment + offset, so calling this
    // repeatedly (every time the appointment list refreshes) is safe.
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Nothing was scheduled yet — fine.
    }

    const label = offsetMinutes >= 60 ? `${offsetMinutes / 60}h` : `${offsetMinutes}m`;
    const timeString = appointment.dateTime.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: appointment.isFamilyBooking ? 'Family booking coming up' : 'Upcoming appointment',
        body: `${appointment.serviceName || 'Your appointment'}${
          appointment.shopName ? ` at ${appointment.shopName}` : ''
        } is at ${timeString} — ${label} to go.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
  }
}

export async function cancelAppointmentReminders(appointmentId: string) {
  if (!isSupported) return;
  for (const offsetMinutes of REMINDER_OFFSETS_MINUTES) {
    try {
      await Notifications.cancelScheduledNotificationAsync(reminderId(appointmentId, offsetMinutes));
    } catch {
      // Nothing scheduled — fine.
    }
  }
}

export async function syncAppointmentReminders(appointments: ReminderAppointment[]) {
  if (!isSupported) return;
  await Promise.all(appointments.map(scheduleAppointmentReminders));
}
