import React from 'react';
import {AdminCollectionManager,commonStatuses} from '@/components/admin/AdminKit';
export default function Screen(){return <AdminCollectionManager title="Content Approvals" subtitle="Review pending salon submissions" collectionName="pending_services" searchKeys={['name','serviceName','shopName','ownerName','category']} statusOptions={commonStatuses} columns={[{key:'name',label:'Submission'},{key:'shopName',label:'Shop'},{key:'category',label:'Category'},{key:'price',label:'Price'},{key:'duration',label:'Duration'}]} />}
