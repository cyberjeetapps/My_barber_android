import React from 'react';
import {AdminCollectionManager,commonStatuses} from '@/components/admin/AdminKit';
export default function Screen(){return <AdminCollectionManager title="Audit Logs" subtitle="Trace sensitive admin changes" collectionName="adminAuditLogs" searchKeys={['action','entityType','entityId','adminName','reason']} statusOptions={[]} columns={[{key:'action',label:'Action'},{key:'entityType',label:'Entity'},{key:'entityId',label:'Record ID'},{key:'adminName',label:'Admin'},{key:'reason',label:'Reason'},{key:'createdAt',label:'Time'}]} />}
