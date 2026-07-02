// Страница администратора МНЭ: создание модераторов госорганов.
// Гвард роли и вся логика — в UserManager (kind="moderators").
import Header from "@/components/Header";
import UserManager from "@/components/UserManager";

export default function ModeratorsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <UserManager kind="moderators" />
    </div>
  );
}
