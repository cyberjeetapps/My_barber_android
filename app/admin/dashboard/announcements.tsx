import React from 'react';
import { AdminCollectionManager } from '@/components/admin/AdminKit';
export default function Screen() {
  return <AdminCollectionManager
    title="Announcement Banners"
    subtitle="Platform-wide banners shown to every customer"
    collectionName="announcementBanners"
    searchKeys={['title', 'message']}
    statusOptions={[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]}
    allowCreate
    allowDelete
    formFields={[{ key: 'title', label: 'Title' }, { key: 'message', label: 'Message', multiline: true }]}
    defaultValues={{ status: 'active' }}
    columns={[{ key: 'title', label: 'Title' }, { key: 'message', label: 'Message' }, { key: 'createdAt', label: 'Created' }]}
  />;
}
