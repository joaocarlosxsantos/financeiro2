import { requireUserId } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { NotificationsFeed } from "@/components/notification-center";
import { NotificationSettings } from "@/components/notification-settings";
export const metadata = { title: "Notificações" };
export default async function NotificationsPage(){await requireUserId();return <div className="space-y-6"><PageHeader title="Notificações" description="Seus avisos e preferências, em um só lugar."/><section className="card p-4 sm:p-6"><NotificationsFeed/></section><NotificationSettings/></div>;}
