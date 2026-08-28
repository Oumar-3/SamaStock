import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { SkeletonCard } from "@/components/SkeletonCard";
import { useDebts } from "@/context/DebtsContext";
import { useColors } from "@/hooks/useColors";
import type { DebtPaymentRecord, DebtWithClient } from "@/models";

function money(value: number) {
  return `${Math.round(value).toLocaleString()} FCFA`;
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

type DebtInputProps = {
  colors: ReturnType<typeof useColors>;
  icon: React.ComponentProps<typeof Feather>["name"];
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "numeric" | "phone-pad";
};

function DebtInput(props: DebtInputProps) {
  return (
    <View style={styles.inputField}>
      <Text style={[styles.inputLabel, { color: props.colors.text }]}>{props.placeholder}</Text>
      <View style={[styles.inputBox, { borderColor: props.colors.border, backgroundColor: props.colors.card }]}>
        <Feather name={props.icon} size={16} color={props.colors.mutedForeground} />
        <TextInput
          style={[styles.input, { color: props.colors.text }]}
          placeholder={"Saisir " + props.placeholder.toLowerCase()}
          placeholderTextColor={props.colors.mutedForeground}
          value={props.value}
          onChangeText={props.onChangeText}
          keyboardType={props.keyboardType}
          accessibilityLabel={props.placeholder}
        />
      </View>
    </View>
  );
}

function DebtCard({ debt, onPay, onOpen }: { debt: DebtWithClient; onPay: () => void; onOpen: () => void }) {
  const colors = useColors();
  const progress = debt.amount > 0 ? Math.min(1, debt.paidAmount / debt.amount) : 0;
  const percent = Math.round(progress * 100);
  const isPaid = debt.status === "paid";

  return (
    <TouchableOpacity
      style={[styles.debtCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onOpen}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={"Ouvrir la dette de " + debt.clientName + ", reste " + money(debt.balance)}
    >
      <View style={styles.debtTop}>
        <View style={[styles.debtIcon, { backgroundColor: (isPaid ? colors.success : colors.destructive) + "14" }]}>
          <Feather name={isPaid ? "check-circle" : "user"} size={18} color={isPaid ? colors.success : colors.destructive} />
        </View>
        <View style={styles.debtInfo}>
          <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>{debt.clientName}</Text>
          <Text style={[styles.clientMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
            {debt.clientPhone ?? "Telephone non renseigne"}
          </Text>
        </View>
        <View style={styles.balanceBox}>
          <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>{isPaid ? "Reglee" : "Reste"}</Text>
          <Text style={[styles.balance, { color: isPaid ? colors.success : colors.destructive }]}>{isPaid ? money(debt.amount) : money(debt.balance)}</Text>
        </View>
      </View>

      {debt.description ? (
        <Text style={[styles.description, { color: colors.mutedForeground }]} numberOfLines={2}>{debt.description}</Text>
      ) : null}

      <View style={styles.progressHeader}>
        <Text style={[styles.debtMeta, { color: colors.mutedForeground }]}>Paye {money(debt.paidAmount)}</Text>
        <Text style={[styles.debtMetaStrong, { color: colors.success }]}>{percent}%</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: colors.success }]} />
      </View>
      <View style={styles.debtMetaRow}>
        <Text style={[styles.debtMeta, { color: colors.mutedForeground }]}>Total {money(debt.amount)}</Text>
        <Text style={[styles.debtMeta, { color: colors.mutedForeground }]}>{shortDate(debt.createdAt)} - Details</Text>
      </View>

      {isPaid ? null : (
        <TouchableOpacity
          style={[styles.payBtn, { backgroundColor: colors.primary }]}
          onPress={event => {
            event.stopPropagation();
            onPay();
          }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={"Ajouter un remboursement pour " + debt.clientName}
        >
          <Feather name="check-circle" size={18} color="#fff" />
          <Text style={styles.payBtnText}>Ajouter remboursement</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function DebtsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openDebts, paidDebts, totalOpenDebt, isLoading, createDebtForClient, updateDebt, addPayment, listPayments } = useDebts();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"open" | "paid">("open");
  const [showAdd, setShowAdd] = useState(false);
  const [payingDebt, setPayingDebt] = useState<DebtWithClient | null>(null);
  const [selectedDebt, setSelectedDebt] = useState<DebtWithClient | null>(null);
  const [editingDebt, setEditingDebt] = useState<DebtWithClient | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<DebtPaymentRecord[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [editClientName, setEditClientName] = useState("");
  const [editClientPhone, setEditClientPhone] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const totalPaid = openDebts.reduce((sum, debt) => sum + debt.paidAmount, 0);
  const totalSettled = paidDebts.reduce((sum, debt) => sum + debt.amount, 0);
  const activeDebts = viewMode === "open" ? openDebts : paidDebts;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeDebts;
    return activeDebts.filter(debt =>
      [debt.clientName, debt.clientPhone, debt.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [activeDebts, search]);

  async function openDebtDetails(debt: DebtWithClient) {
    setSelectedDebt(debt);
    setSelectedPayments([]);
    try {
      setSelectedPayments(await listPayments(debt.id));
    } catch {
      setSelectedPayments([]);
    }
  }

  function openEditDebt(debt: DebtWithClient) {
    if (debt.status === "paid") {
      Alert.alert("Dette reglee", "Cette dette est conservee comme preuve et ne peut plus etre modifiee.");
      return;
    }
    setSelectedDebt(null);
    setEditingDebt(debt);
    setEditClientName(debt.clientName);
    setEditClientPhone(debt.clientPhone ?? "");
    setEditAmount(`${debt.amount}`);
    setEditDescription(debt.description ?? "");
  }

  async function handleAddDebt() {
    const parsedAmount = parseFloat(amount);
    if (!clientName.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Dette incomplete", "Renseignez au moins le nom du client et un montant valide.");
      return;
    }

    setBusy(true);
    try {
      await createDebtForClient(
        { name: clientName.trim(), phone: clientPhone.trim() || undefined },
        parsedAmount,
        description.trim() || "Dette ajoutee manuellement",
      );
      setClientName("");
      setClientPhone("");
      setAmount("");
      setDescription("");
      setShowAdd(false);
    } catch (err) {
      Alert.alert("Impossible d'ajouter la dette", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePayment() {
    if (!payingDebt) return;
    const parsedAmount = parseFloat(paymentAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Montant invalide", "Entrez un montant de remboursement valide.");
      return;
    }

    setBusy(true);
    try {
      await addPayment(payingDebt.id, parsedAmount, paymentNote.trim() || undefined);
      setPaymentAmount("");
      setPaymentNote("");
      setPayingDebt(null);
    } catch (err) {
      Alert.alert("Remboursement impossible", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateDebt() {
    if (!editingDebt) return;
    if (editingDebt.status === "paid") {
      Alert.alert("Dette reglee", "Cette dette ne peut plus etre modifiee.");
      setEditingDebt(null);
      return;
    }
    const parsedAmount = parseFloat(editAmount);
    if (!editClientName.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Dette incomplete", "Renseignez le client et un montant valide.");
      return;
    }
    if (parsedAmount < editingDebt.paidAmount) {
      Alert.alert("Montant impossible", "Le montant ne peut pas etre inferieur au total deja rembourse.");
      return;
    }

    setBusy(true);
    try {
      await updateDebt(editingDebt.id, {
        clientName: editClientName.trim(),
        clientPhone: editClientPhone.trim() || undefined,
        amount: parsedAmount,
        description: editDescription.trim() || undefined,
      });
      setEditingDebt(null);
      setEditClientName("");
      setEditClientPhone("");
      setEditAmount("");
      setEditDescription("");
    } catch (err) {
      Alert.alert("Modification impossible", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: colors.text }]}>Dettes</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {openDebts.length} dette{openDebts.length > 1 ? "s" : ""} ouverte{openDebts.length > 1 ? "s" : ""}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
            onPress={() => setShowAdd(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Ajouter une dette"
          >
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryGrid}>
          <View style={[styles.summaryCard, { backgroundColor: (viewMode === "open" ? colors.destructive : colors.success) + "12" }]}>
            <Text style={[styles.summaryLabel, { color: viewMode === "open" ? colors.destructive : colors.success }]}>
              {viewMode === "open" ? "A recuperer" : "Dettes reglees"}
            </Text>
            <Text style={[styles.summaryValue, { color: viewMode === "open" ? colors.destructive : colors.success }]}>
              {viewMode === "open" ? money(totalOpenDebt) : String(paidDebts.length)}
            </Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.success + "12" }]}>
            <Text style={[styles.summaryLabel, { color: colors.success }]}>
              {viewMode === "open" ? "Deja rembourse" : "Total regle"}
            </Text>
            <Text style={[styles.summaryValue, { color: colors.success }]}>
              {money(viewMode === "open" ? totalPaid : totalSettled)}
            </Text>
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Client, telephone ou description"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            accessibilityLabel="Rechercher une dette par client, telephone ou description"
          />
          {search ? (
            <TouchableOpacity
              style={styles.clearSearchBtn}
              onPress={() => setSearch("")}
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
            >
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={[styles.segment, { backgroundColor: colors.muted }]}>
          {([
            { key: "open", label: `Ouvertes (${openDebts.length})` },
            { key: "paid", label: `Reglees (${paidDebts.length})` },
          ] as const).map(item => (
            <TouchableOpacity
              key={item.key}
              style={[styles.segmentBtn, viewMode === item.key && { backgroundColor: colors.card }]}
              onPress={() => setViewMode(item.key)}
              activeOpacity={0.82}
              accessibilityRole="tab"
              accessibilityState={{ selected: viewMode === item.key }}
              accessibilityLabel={item.label}
            >
              <Text style={[styles.segmentText, { color: viewMode === item.key ? colors.primary : colors.mutedForeground }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        style={styles.list}
        data={isLoading ? [] : filtered}
        keyExtractor={debt => debt.id}
        renderItem={({ item: debt }) => (
          <DebtCard
            debt={debt}
            onOpen={() => openDebtDetails(debt)}
            onPay={() => setPayingDebt(debt)}
          />
        )}
        ListHeaderComponent={
          !isLoading && filtered.length > 0 ? (
            <View style={styles.resultRow}>
              <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                {filtered.length} dette{filtered.length > 1 ? "s" : ""}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <SkeletonCard count={5} />
          ) : (
            <EmptyState
              icon={viewMode === "open" ? "credit-card" : "check-circle"}
              title={viewMode === "open" ? "Aucune dette ouverte" : "Aucune dette reglee"}
              subtitle={
                search
                  ? "Aucune dette ne correspond a cette recherche"
                  : viewMode === "open"
                    ? "Les ventes a credit et dettes manuelles apparaitront ici"
                    : "Les dettes remboursees resteront ici comme preuve"
              }
              actionLabel={search || viewMode === "paid" ? undefined : "Ajouter une dette"}
              onAction={search || viewMode === "paid" ? undefined : () => setShowAdd(true)}
            />
          )
        }
        contentContainerStyle={[
          styles.listContent,
          !isLoading && filtered.length === 0 ? styles.emptyListContent : null,
          { paddingBottom: bottomPad + 90 },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
      />

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Nouvelle dette</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Client, montant et note</Text>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.muted }]} onPress={() => setShowAdd(false)} accessibilityRole="button" accessibilityLabel="Fermer la nouvelle dette">
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <DebtInput colors={colors} icon="user" placeholder="Nom client" value={clientName} onChangeText={setClientName} />
            <DebtInput colors={colors} icon="phone" placeholder="Telephone" value={clientPhone} onChangeText={setClientPhone} keyboardType="phone-pad" />
            <DebtInput colors={colors} icon="credit-card" placeholder="Montant" value={amount} onChangeText={setAmount} keyboardType="numeric" />
            <DebtInput colors={colors} icon="edit-3" placeholder="Description" value={description} onChangeText={setDescription} />
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]} onPress={handleAddDebt} disabled={busy} accessibilityRole="button" accessibilityLabel="Enregistrer la dette" accessibilityState={{ disabled: busy, busy }}>
              <Text style={styles.primaryBtnText}>Enregistrer la dette</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!payingDebt} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPayingDebt(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Remboursement</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Encaisser une partie ou tout</Text>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.muted }]} onPress={() => setPayingDebt(null)} accessibilityRole="button" accessibilityLabel="Fermer le remboursement">
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            {payingDebt ? (
              <View style={[styles.paymentSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.clientName, { color: colors.text }]}>{payingDebt.clientName}</Text>
                <Text style={[styles.clientMeta, { color: colors.mutedForeground }]}>Reste: {money(payingDebt.balance)}</Text>
              </View>
            ) : null}
            <DebtInput colors={colors} icon="dollar-sign" placeholder="Montant paye" value={paymentAmount} onChangeText={setPaymentAmount} keyboardType="numeric" />
            <DebtInput colors={colors} icon="edit-3" placeholder="Note optionnelle" value={paymentNote} onChangeText={setPaymentNote} />
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]} onPress={handlePayment} disabled={busy} accessibilityRole="button" accessibilityLabel="Valider le remboursement" accessibilityState={{ disabled: busy, busy }}>
              <Text style={styles.primaryBtnText}>Valider le paiement</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!selectedDebt} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedDebt(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Detail dette</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Preuve, motif et paiements</Text>
            </View>
            <View style={styles.modalActions}>
              {selectedDebt && selectedDebt.status !== "paid" ? (
                <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.primary + "12" }]} onPress={() => openEditDebt(selectedDebt)} accessibilityRole="button" accessibilityLabel="Modifier cette dette">
                  <Feather name="edit-3" size={18} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.muted }]} onPress={() => setSelectedDebt(null)} accessibilityRole="button" accessibilityLabel="Fermer le detail de la dette">
                <Feather name="x" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {selectedDebt ? (
            <ScrollView contentContainerStyle={styles.detailBody}>
              <View style={[styles.detailHero, { backgroundColor: selectedDebt.status === "paid" ? colors.success + "14" : colors.destructive + "12", borderColor: selectedDebt.status === "paid" ? colors.success + "35" : colors.destructive + "35" }]}>
                <Text style={[styles.detailClient, { color: colors.text }]}>{selectedDebt.clientName}</Text>
                <Text style={[styles.detailPhone, { color: colors.mutedForeground }]}>{selectedDebt.clientPhone ?? "Telephone non renseigne"}</Text>
                <View style={styles.detailStatusRow}>
                  <Text style={[styles.detailStatus, { color: selectedDebt.status === "paid" ? colors.success : colors.destructive }]}>
                    {selectedDebt.status === "paid" ? "Dette reglee" : "Dette ouverte"}
                  </Text>
                  <Text style={[styles.detailDate, { color: colors.mutedForeground }]}>{shortDate(selectedDebt.createdAt)}</Text>
                </View>
              </View>

              <View style={styles.detailGrid}>
                <View style={[styles.detailBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Montant dette</Text>
                  <Text style={[styles.detailValue, { color: colors.text }]}>{money(selectedDebt.amount)}</Text>
                </View>
                <View style={[styles.detailBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Rembourse</Text>
                  <Text style={[styles.detailValue, { color: colors.success }]}>{money(selectedDebt.paidAmount)}</Text>
                </View>
                <View style={[styles.detailBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>Reste</Text>
                  <Text style={[styles.detailValue, { color: selectedDebt.balance > 0 ? colors.destructive : colors.success }]}>{money(selectedDebt.balance)}</Text>
                </View>
              </View>

              <View style={[styles.detailSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Sujet de la dette</Text>
                <Text style={[styles.detailDescription, { color: colors.mutedForeground }]}>{selectedDebt.description ?? "Aucune description renseignee"}</Text>
                {selectedDebt.saleId ? (
                  <TouchableOpacity style={[styles.receiptLink, { backgroundColor: colors.primary + "12" }]} onPress={() => router.push({ pathname: "/receipt/[id]", params: { id: selectedDebt.saleId ?? "" } })} accessibilityRole="button" accessibilityLabel="Voir le recu de vente">
                    <Feather name="file-text" size={16} color={colors.primary} />
                    <Text style={[styles.receiptLinkText, { color: colors.primary }]}>Voir le recu de vente</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={[styles.detailSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.detailSectionTitle, { color: colors.text }]}>Paiements</Text>
                {selectedPayments.length === 0 ? (
                  <Text style={[styles.detailDescription, { color: colors.mutedForeground }]}>Aucun remboursement enregistre.</Text>
                ) : (
                  selectedPayments.map(payment => (
                    <View key={payment.id} style={[styles.paymentLine, { borderBottomColor: colors.border }]}>
                      <View>
                        <Text style={[styles.paymentLineAmount, { color: colors.success }]}>{money(payment.amount)}</Text>
                        <Text style={[styles.paymentLineNote, { color: colors.mutedForeground }]}>{payment.note ?? "Remboursement"}</Text>
                      </View>
                      <Text style={[styles.paymentLineDate, { color: colors.mutedForeground }]}>{shortDate(payment.createdAt)}</Text>
                    </View>
                  ))
                )}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      <Modal visible={!!editingDebt} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditingDebt(null)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Modifier dette</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>Corriger client, montant ou motif</Text>
            </View>
            <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.muted }]} onPress={() => setEditingDebt(null)} accessibilityRole="button" accessibilityLabel="Fermer la modification">
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            {editingDebt ? (
              <View style={[styles.paymentSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.clientName, { color: colors.text }]}>Deja rembourse: {money(editingDebt.paidAmount)}</Text>
                <Text style={[styles.clientMeta, { color: colors.mutedForeground }]}>
                  Le nouveau montant doit rester au moins egal a cette somme.
                </Text>
              </View>
            ) : null}
            <DebtInput colors={colors} icon="user" placeholder="Nom client" value={editClientName} onChangeText={setEditClientName} />
            <DebtInput colors={colors} icon="phone" placeholder="Telephone" value={editClientPhone} onChangeText={setEditClientPhone} keyboardType="phone-pad" />
            <DebtInput colors={colors} icon="credit-card" placeholder="Montant dette" value={editAmount} onChangeText={setEditAmount} keyboardType="numeric" />
            <DebtInput colors={colors} icon="edit-3" placeholder="Description / sujet" value={editDescription} onChangeText={setEditDescription} />
            <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }, busy && { opacity: 0.6 }]} onPress={handleUpdateDebt} disabled={busy} accessibilityRole="button" accessibilityLabel="Enregistrer les modifications" accessibilityState={{ disabled: busy, busy }}>
              <Text style={styles.primaryBtnText}>Enregistrer les modifications</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );

}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1 },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", fontWeight: "700" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  summaryGrid: { flexDirection: "row", gap: 10 },
  summaryCard: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, gap: 2 },
  summaryLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  summaryValue: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  searchBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  searchInput: { flex: 1, minHeight: 44, fontSize: 15, fontFamily: "Inter_400Regular" },
  clearSearchBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -10 },
  segment: { flexDirection: "row", borderRadius: 13, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, minHeight: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  list: { flex: 1 },
  listContent: { padding: 16 },
  emptyListContent: { flexGrow: 1 },
  resultRow: { marginBottom: 10 },
  resultText: { fontSize: 12, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  debtCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
    gap: 12,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
  },
  debtTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  debtIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  debtInfo: { flex: 1, gap: 2 },
  clientName: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  clientMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  balanceBox: { alignItems: "flex-end", gap: 1, maxWidth: 118 },
  balanceLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  balance: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  description: { fontSize: 13, lineHeight: 18, fontFamily: "Inter_400Regular" },
  progressHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressTrack: { height: 7, borderRadius: 999, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 999 },
  debtMetaRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  debtMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  debtMetaStrong: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  payBtn: { minHeight: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  payBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1 },
  modalActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700" },
  modalSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  form: { padding: 16, gap: 12 },
  inputField: { gap: 7 },
  inputLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  inputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, gap: 10 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  primaryBtn: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  paymentSummary: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 2 },
  detailBody: { padding: 16, gap: 12 },
  detailHero: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 5 },
  detailClient: { fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700" },
  detailPhone: { fontSize: 13, fontFamily: "Inter_400Regular" },
  detailStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 },
  detailStatus: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  detailDate: { fontSize: 12, fontFamily: "Inter_500Medium", fontWeight: "500" },
  detailGrid: { flexDirection: "row", gap: 8 },
  detailBox: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 11, gap: 4 },
  detailLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", fontWeight: "600", textTransform: "uppercase" },
  detailValue: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  detailSection: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  detailSectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  detailDescription: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  receiptLink: { minHeight: 42, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  receiptLinkText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  paymentLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  paymentLineAmount: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  paymentLineNote: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  paymentLineDate: { fontSize: 12, fontFamily: "Inter_500Medium", fontWeight: "500" },
});
