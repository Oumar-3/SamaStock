import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { useProducts } from "@/context/ProductsContext";
import { useSales } from "@/context/SalesContext";
import { useColors } from "@/hooks/useColors";
import type { ProductRecord } from "@/models";
import { BARCODE_TYPES, getBarcodeCandidates } from "@/utils/barcode";
import { playScanFeedback } from "@/utils/scanFeedback";

type CartItem = {
  product: ProductRecord;
  quantity: number;
};

function ProductButton({ product, onAdd }: { product: ProductRecord; onAdd: () => void }) {
  const colors = useColors();
  const isOut = product.stock === 0;
  const isLow = product.stock <= product.alertThreshold;
  const stockColor = isOut ? colors.destructive : isLow ? colors.warning : colors.success;
  const stockText = isOut ? "Rupture" : isLow ? `Stock ${product.stock}` : `${product.stock} dispo`;

  return (
    <TouchableOpacity
      style={[styles.productBtn, { backgroundColor: colors.card, borderColor: colors.border }, isOut && { opacity: 0.5 }]}
      onPress={isOut ? undefined : onAdd}
      activeOpacity={0.75}
      disabled={isOut}
      accessibilityRole="button"
      accessibilityLabel={product.name + ", " + product.sellPrice.toLocaleString() + " francs, stock " + product.stock}
      accessibilityHint={isOut ? "Produit en rupture de stock" : "Choisir la quantite a ajouter"}
      accessibilityState={{ disabled: isOut }}
    >
      <View style={styles.productMediaRow}>
        {product.imageUri ? (
          <Image source={{ uri: product.imageUri }} style={styles.productImage} />
        ) : (
          <View style={[styles.productIconBox, { backgroundColor: colors.primary + "15" }]}> 
            <Feather name="package" size={21} color={colors.primary} />
          </View>
        )}
        <View style={[styles.addChip, { backgroundColor: isOut ? colors.muted : colors.primary }]}>
          <Feather name={isOut ? "minus" : "plus"} size={15} color={isOut ? colors.mutedForeground : "#fff"} />
        </View>
      </View>
      <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>
        {product.name}
      </Text>
      <View style={styles.productFooter}>
        <Text style={[styles.productPrice, { color: colors.text }]}>{product.sellPrice.toLocaleString()} F</Text>
        <View style={[styles.productStockPill, { backgroundColor: stockColor + "14" }]}> 
          <Text style={[styles.productStock, { color: stockColor }]} numberOfLines={1}>{stockText}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
export default function SaleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { products } = useProducts();
  const { createCashSale, createCreditSale } = useSales();
  const [permission, requestPermission] = useCameraPermissions();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRecord | null>(null);
  const [quantityInput, setQuantityInput] = useState("1");
  const [search, setSearch] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [scanLocked, setScanLocked] = useState(false);
  const [scanMessage, setScanMessage] = useState("");
  const [unknownScannedCode, setUnknownScannedCode] = useState("");
  const [scannedProduct, setScannedProduct] = useState<ProductRecord | null>(null);
  const [scanQuantityInput, setScanQuantityInput] = useState("1");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const cartTotal = cart.reduce((sum, item) => sum + item.product.sellPrice * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const availableProducts = products.filter(product => product.stock > 0).length;

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(product => {
      if (product.stock <= 0) return false;
      if (!q) return true;
      return [product.name, product.category, product.brand, product.format, product.barcode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [products, search]);

  function getAvailableStock(product: ProductRecord) {
    const inCart = cart.find(item => item.product.id === product.id)?.quantity ?? 0;
    return product.stock - inCart;
  }

  function openQuantity(product: ProductRecord, initialQuantity = 1) {
    const available = getAvailableStock(product);
    if (available <= 0) {
      Alert.alert("Stock insuffisant", `Il ne reste plus de stock disponible pour ${product.name}.`);
      return;
    }
    setSelectedProduct(product);
    setQuantityInput(`${Math.min(initialQuantity, available)}`);
  }

  function addToCart(product: ProductRecord, quantity = 1) {
    const available = getAvailableStock(product);
    if (available <= 0 || quantity > available) {
      Alert.alert("Stock insuffisant", `Stock disponible : ${Math.max(0, available)}`);
      return;
    }
    if (quantity <= 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item);
      }
      return [...prev, { product, quantity }];
    });
  }

  function cancelCart() {
    if (cart.length === 0) return;
    Alert.alert("Annuler le panier ?", "Tous les articles du panier seront retires.", [
      { text: "Garder", style: "cancel" },
      {
        text: "Annuler le panier",
        style: "destructive",
        onPress: () => {
          setCart([]);
          setShowCart(false);
          setShowCreditForm(false);
          setClientName("");
          setClientPhone("");
        },
      },
    ]);
  }

  function openCartFromScanner() {
    setShowScanner(false);
    setScanLocked(false);
    setScanMessage("");
    setUnknownScannedCode("");
    setScannedProduct(null);
    setTimeout(() => setShowCart(true), 250);
  }

  function confirmAddSelected() {
    if (!selectedProduct) return;
    const quantity = parseInt(quantityInput, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert("Quantite invalide", "Entrez une quantite valide.");
      return;
    }
    addToCart(selectedProduct, quantity);
    setSelectedProduct(null);
    setQuantityInput("1");
  }

  function findProductFromCode(code: string) {
    const candidates = getBarcodeCandidates(code);
    if (candidates.length === 0) return null;
    return products.find(product => product.barcode && candidates.includes(product.barcode.trim()) && product.stock > 0) ?? null;
  }

  function handleManualCode() {
    const product = findProductFromCode(search);
    if (product) {
      openQuantity(product);
      setSearch("");
      return;
    }
    Alert.alert("Code inconnu", "Aucun produit disponible ne correspond a ce code-barres.", [
      { text: "Annuler", style: "cancel" },
      { text: "Ajouter produit", onPress: () => router.push({ pathname: "/product/add", params: { barcode: search.trim() } }) },
    ]);
  }

  function openAddProductFromScanner(code: string) {
    setUnknownScannedCode("");
    setScannedProduct(null);
    setShowScanner(false);
    setScanLocked(false);
    setScanMessage("");
    setTimeout(() => {
      router.push({ pathname: "/product/add", params: { barcode: code } });
    }, 250);
  }

  function handleScanned(result: BarcodeScanningResult) {
    if (scanLocked) return;
    const code = result.data.trim();
    playScanFeedback();
    setScanLocked(true);
    const product = findProductFromCode(code);
    if (product) {
      setScannedProduct(product);
      setScanQuantityInput("1");
      setScanMessage("");
    } else {
      setScanMessage(`Code inconnu : ${code}`);
      setUnknownScannedCode(code);
    }
  }

  function cancelScannedProduct() {
    setScannedProduct(null);
    setScanQuantityInput("1");
    setScanMessage("");
    setTimeout(() => setScanLocked(false), 250);
  }

  function addScannedProductToCart() {
    if (!scannedProduct) return;
    const quantity = parseInt(scanQuantityInput, 10);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setScanMessage("Quantite invalide");
      return;
    }

    addToCart(scannedProduct, quantity);
    setScanMessage(`${quantity} x ${scannedProduct.name} ajoute`);
    setScannedProduct(null);
    setScanQuantityInput("1");
    setTimeout(() => {
      setScanMessage("");
      setScanLocked(false);
    }, 750);
  }

  function removeFromCart(productId: string) {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  }

  function updateQty(productId: string, quantity: number) {
    if (quantity <= 0) return removeFromCart(productId);
    const cartItem = cart.find(item => item.product.id === productId);
    if (!cartItem) return;
    if (quantity > cartItem.product.stock) {
      Alert.alert("Stock insuffisant", `Stock disponible : ${cartItem.product.stock}`);
      return;
    }
    setCart(prev => prev.map(item => item.product.id === productId ? { ...item, quantity } : item));
  }

  async function confirmSale() {
    if (cart.length === 0) return;
    setConfirmLoading(true);
    try {
      const sale = await createCashSale(cart.map(item => ({ productId: item.product.id, quantity: item.quantity })));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCart([]);
      setShowCart(false);
      router.push({ pathname: "/receipt/[id]", params: { id: sale.id } });
    } catch (err) {
      Alert.alert("Vente impossible", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function confirmCreditSale() {
    if (cart.length === 0) return;
    if (!clientName.trim()) {
      Alert.alert("Client requis", "Entrez le nom du client pour enregistrer la dette.");
      return;
    }

    setConfirmLoading(true);
    try {
      const debtDescription = cart
        .map(item => `${item.product.name} x${item.quantity}`)
        .join(", ");
      const sale = await createCreditSale({
        items: cart.map(item => ({ productId: item.product.id, quantity: item.quantity })),
        client: { name: clientName.trim(), phone: clientPhone.trim() || undefined },
        description: debtDescription || `Vente a credit - ${cartCount} article${cartCount > 1 ? "s" : ""}`,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCart([]);
      setShowCart(false);
      setShowCreditForm(false);
      setClientName("");
      setClientPhone("");
      router.push({ pathname: "/receipt/[id]", params: { id: sale.id } });
    } catch (err) {
      Alert.alert("Vente impossible", err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setConfirmLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 14, backgroundColor: colors.background, borderBottomColor: colors.border }]}> 
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.kicker, { color: colors.primary }]}>Mode caisse</Text>
            <Text style={[styles.title, { color: colors.text }]}>Vente rapide</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}> 
              {availableProducts} produits disponibles
            </Text>
          </View>
        </View>

        <View style={[styles.cashierPanel, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <View style={styles.cashierTopRow}>
            <View style={styles.cashierCopy}>
              <Text style={[styles.cashierLabel, { color: colors.mutedForeground }]}>Panier en cours</Text>
              <Text style={[styles.cashierTotal, { color: colors.text }]}>{cartTotal.toLocaleString()} FCFA</Text>
              <Text style={[styles.cashierHint, { color: colors.mutedForeground }]}> 
                {cartCount > 0 ? `${cartCount} article${cartCount > 1 ? "s" : ""} pret${cartCount > 1 ? "s" : ""} a encaisser` : "Scannez ou touchez un produit"}
              </Text>
            </View>
            <View style={[styles.cashierIcon, { backgroundColor: colors.primary + "14" }]}> 
              <Feather name="shopping-cart" size={23} color={colors.primary} />
            </View>
          </View>
          <View style={styles.cashierActions}>
            <TouchableOpacity
              style={[styles.cashierActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => (cartCount > 0 ? setShowCart(true) : setShowScanner(true))}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityLabel={cartCount > 0 ? "Voir le panier" : "Scanner un produit"}
            >
              <Feather name={cartCount > 0 ? "shopping-bag" : "camera"} size={16} color="#fff" />
              <Text style={styles.cashierActionText}>{cartCount > 0 ? "Voir panier" : "Scanner"}</Text>
            </TouchableOpacity>
            {cartCount > 0 ? (
              <TouchableOpacity
                style={[styles.cashierActionBtn, styles.cashierActionSecondary, { backgroundColor: colors.destructive + "12" }]}
                onPress={cancelCart}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Annuler le panier"
              >
                <Feather name="trash-2" size={16} color={colors.destructive} />
                <Text style={[styles.cashierActionText, { color: colors.destructive }]}>Annuler</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}> 
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Rechercher ou saisir code-barres"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Rechercher un produit ou saisir un code-barres"
          />
          {search ? (
            <View style={styles.searchTools}>
              <TouchableOpacity
                onPress={() => setSearch("")}
                style={[styles.codeBtn, { backgroundColor: colors.muted }]}
                accessibilityRole="button"
                accessibilityLabel="Effacer la recherche"
              >
                <Feather name="x" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleManualCode}
                style={[styles.codeBtn, { backgroundColor: colors.primary + "12" }]}
                accessibilityRole="button"
                accessibilityLabel="Rechercher ce code-barres"
              >
                <Feather name="hash" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryPill, { backgroundColor: colors.primary + "12" }]}> 
            <Feather name="shopping-bag" size={14} color={colors.primary} />
            <Text style={[styles.summaryText, { color: colors.primary }]}>{cartCount} article{cartCount > 1 ? "s" : ""}</Text>
          </View>
          <View style={[styles.summaryPill, { backgroundColor: colors.info + "12" }]}> 
            <Feather name="box" size={14} color={colors.info} />
            <Text style={[styles.summaryText, { color: colors.info }]}>{filteredProducts.length} resultats</Text>
          </View>
        </View>
      </View>
      <FlatList
        data={filteredProducts}
        numColumns={2}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ProductButton product={item} onAdd={() => openQuantity(item)} />}
        contentContainerStyle={[styles.grid, { paddingBottom: bottomPad + 120 }]}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={<EmptyState icon="package" title="Aucun produit" subtitle="Ajoutez des produits pour commencer a vendre" />}
        showsVerticalScrollIndicator={false}
      />

      {cartCount > 0 && (
        <View style={[styles.cartBar, { backgroundColor: colors.primary, shadowColor: colors.primary, paddingBottom: bottomPad + 8 }]}>
          <TouchableOpacity
            style={styles.cartBarContent}
            onPress={() => setShowCart(true)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={"Voir le panier, " + cartCount + " articles, total " + cartTotal.toLocaleString() + " francs"}
          >
            <View style={styles.cartCount}>
              <Text style={styles.cartCountText}>{cartCount}</Text>
            </View>
            <Text style={styles.cartBarText}>Voir le panier</Text>
            <Text style={styles.cartBarTotal}>{cartTotal.toLocaleString()} FCFA</Text>
            <Feather name="chevron-up" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showCart} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCart(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Panier</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>{cartCount} article{cartCount > 1 ? "s" : ""}</Text>
            </View>
            <View style={styles.cartHeaderActions}>
              {cart.length > 0 ? (
                <TouchableOpacity
                  style={[styles.clearCartBtn, { backgroundColor: colors.destructive + "12" }]}
                  onPress={cancelCart}
                  accessibilityRole="button"
                  accessibilityLabel="Vider le panier"
                >
                  <Feather name="trash-2" size={17} color={colors.destructive} />
                  <Text style={[styles.clearCartText, { color: colors.destructive }]}>Vider</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.muted }]}
                onPress={() => setShowCart(false)}
                accessibilityRole="button"
                accessibilityLabel="Fermer le panier"
              >
                <Feather name="x" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.cartItems} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
            {cart.map(item => (
              <View key={item.product.id} style={[styles.cartItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cartItemInfo}>
                  <Text style={[styles.cartItemName, { color: colors.text }]} numberOfLines={1}>{item.product.name}</Text>
                  <Text style={[styles.cartItemPrice, { color: colors.primary }]}>
                    {(item.product.sellPrice * item.quantity).toLocaleString()} FCFA
                  </Text>
                  <Text style={[styles.cartItemUnit, { color: colors.mutedForeground }]}>
                    {item.product.sellPrice.toLocaleString()} F x {item.quantity}
                  </Text>
                </View>
                <View style={styles.qtyControls}>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { backgroundColor: colors.muted }]}
                    onPress={() => updateQty(item.product.id, item.quantity - 1)}
                    accessibilityRole="button"
                    accessibilityLabel={"Retirer une unite de " + item.product.name}
                  >
                    <Feather name="minus" size={14} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.qtyText, { color: colors.text }]}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, { backgroundColor: colors.muted }]}
                    onPress={() => updateQty(item.product.id, item.quantity + 1)}
                    accessibilityRole="button"
                    accessibilityLabel={"Ajouter une unite de " + item.product.name}
                  >
                    <Feather name="plus" size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.modalFooter, { borderTopColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: colors.mutedForeground }]}>Total</Text>
              <Text style={[styles.totalAmount, { color: colors.text }]}>{cartTotal.toLocaleString()} FCFA</Text>
            </View>
            {showCreditForm && (
              <View style={[styles.creditForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.creditTitle, { color: colors.text }]}>Client pour dette</Text>
                <View style={[styles.creditInputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Feather name="user" size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.creditInput, { color: colors.text }]}
                    placeholder="Nom client"
                    placeholderTextColor={colors.mutedForeground}
                    value={clientName}
                    onChangeText={setClientName}
                  />
                </View>
                <View style={[styles.creditInputBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Feather name="phone" size={16} color={colors.mutedForeground} />
                  <TextInput
                    style={[styles.creditInput, { color: colors.text }]}
                    placeholder="Telephone optionnel"
                    placeholderTextColor={colors.mutedForeground}
                    value={clientPhone}
                    onChangeText={setClientPhone}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>
            )}
            <View style={styles.saleActions}>
              <TouchableOpacity
                style={[styles.creditBtn, { borderColor: colors.border, backgroundColor: colors.card }, confirmLoading && { opacity: 0.7 }]}
                onPress={showCreditForm ? confirmCreditSale : () => setShowCreditForm(true)}
                disabled={confirmLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={showCreditForm ? "Valider la vente a credit" : "Choisir une vente a credit"}
                accessibilityState={{ disabled: confirmLoading, busy: confirmLoading }}
              >
                <Feather name="credit-card" size={18} color={colors.primary} />
                <Text style={[styles.creditBtnText, { color: colors.primary }]}>
                  {showCreditForm ? "Valider le credit" : "A credit"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.primary, shadowColor: colors.primary }, confirmLoading && { opacity: 0.7 }]}
                onPress={confirmSale}
                disabled={confirmLoading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Valider le paiement comptant"
                accessibilityState={{ disabled: confirmLoading, busy: confirmLoading }}
              >
                <Feather name="check-circle" size={20} color="#fff" />
                <Text style={styles.confirmBtnText}>Comptant</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!selectedProduct} animationType="fade" transparent onRequestClose={() => setSelectedProduct(null)}>
        <View style={styles.overlay}>
          <View style={[styles.quantityCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.quantityHeader}>
              <View style={[styles.quantityIcon, { backgroundColor: colors.primary + "14" }]}>
                <Feather name="shopping-cart" size={22} color={colors.primary} />
              </View>
              <View style={styles.quantityInfo}>
                <Text style={[styles.quantityTitle, { color: colors.text }]} numberOfLines={1}>{selectedProduct?.name}</Text>
                <Text style={[styles.quantityMeta, { color: colors.mutedForeground }]}>
                  Stock dispo : {selectedProduct ? getAvailableStock(selectedProduct) : 0} - {selectedProduct?.sellPrice.toLocaleString()} FCFA
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedProduct(null)} style={[styles.closeBtn, { backgroundColor: colors.muted }]}>
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.quantityStepper}>
              <TouchableOpacity
                style={[styles.bigQtyBtn, { backgroundColor: colors.muted }]}
                onPress={() => setQuantityInput(value => `${Math.max(1, (parseInt(value, 10) || 1) - 1)}`)}
              >
                <Feather name="minus" size={22} color={colors.text} />
              </TouchableOpacity>
              <TextInput
                style={[styles.quantityInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                value={quantityInput}
                onChangeText={setQuantityInput}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
              />
              <TouchableOpacity
                style={[styles.bigQtyBtn, { backgroundColor: colors.muted }]}
                onPress={() => {
                  if (!selectedProduct) return;
                  const next = (parseInt(quantityInput, 10) || 0) + 1;
                  setQuantityInput(`${Math.min(next, getAvailableStock(selectedProduct))}`);
                }}
              >
                <Feather name="plus" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.quickQtyRow}>
              {[1, 2, 5, 10].map(qty => (
                <TouchableOpacity key={qty} style={[styles.quickQtyBtn, { borderColor: colors.border }]} onPress={() => setQuantityInput(`${qty}`)}>
                  <Text style={[styles.quickQtyText, { color: colors.primary }]}>{qty}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.addToCartBtn, { backgroundColor: colors.primary }]} onPress={confirmAddSelected}>
              <Feather name="plus-circle" size={19} color="#fff" />
              <Text style={styles.addToCartText}>Ajouter au panier</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showScanner} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowScanner(false)}>
        <View style={[styles.scannerRoot, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, paddingTop: topPad + 12 }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Scanner vente</Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                {cartCount > 0 ? `${cartCount} article${cartCount > 1 ? "s" : ""} - ${cartTotal.toLocaleString()} FCFA` : "Scannez les produits vendus"}
              </Text>
            </View>
            <View style={styles.cartHeaderActions}>
              {cartCount > 0 ? (
                <TouchableOpacity
                  style={[styles.scannerCartBtn, { backgroundColor: colors.primary + "12" }]}
                  onPress={openCartFromScanner}
                  accessibilityRole="button"
                  accessibilityLabel={"Voir le panier, " + cartCount + " articles"}
                >
                  <Feather name="shopping-cart" size={17} color={colors.primary} />
                  <Text style={[styles.scannerCartText, { color: colors.primary }]}>{cartCount}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.muted }]}
                onPress={() => {
                setShowScanner(false);
                setScanLocked(false);
                setScanMessage("");
                setUnknownScannedCode("");
                setScannedProduct(null);
              }}
              >
                <Feather name="x" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.scannerBody}>
            {!permission ? (
              <ActivityIndicator color={colors.primary} />
            ) : !permission.granted ? (
              <View style={styles.permissionBox}>
                <Feather name="camera" size={42} color={colors.primary} />
                <Text style={[styles.permissionTitle, { color: colors.text }]}>Camera requise</Text>
                <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: colors.primary }]} onPress={requestPermission}>
                  <Text style={styles.confirmBtnText}>Autoriser la camera</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.cameraWrap}>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  zoom={0.08}
                  enableTorch={torchEnabled}
                  barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
                  onBarcodeScanned={handleScanned}
                />
                <View style={styles.scanFrame} />
                <TouchableOpacity
                  style={[styles.torchBtn, torchEnabled && styles.torchBtnActive]}
                  onPress={() => setTorchEnabled(value => !value)}
                  activeOpacity={0.85}
                >
                  <Feather name={torchEnabled ? "zap-off" : "zap"} size={18} color="#fff" />
                  <Text style={styles.torchText}>{torchEnabled ? "Lampe active" : "Lampe"}</Text>
                </TouchableOpacity>
                <View style={styles.scanHint}>
                  <Text style={styles.scanHintText}>{scanMessage || "Cadrez le code-barres du produit"}</Text>
                </View>
                {scannedProduct ? (
                  <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "position" : undefined}
                    keyboardVerticalOffset={24}
                    style={[styles.scanQuantityPanelWrap, keyboardVisible && styles.scanQuantityPanelWrapKeyboard]}
                  >
                    <View style={[styles.scanQuantityPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.scanQuantityHeader}>
                        {scannedProduct.imageUri ? (
                          <Image source={{ uri: scannedProduct.imageUri }} style={styles.scanProductImage} />
                        ) : (
                          <View style={[styles.scanProductImage, styles.scanProductImageEmpty, { backgroundColor: colors.muted }]}>
                            <Feather name="package" size={18} color={colors.mutedForeground} />
                          </View>
                        )}
                        <View style={styles.scanQuantityInfo}>
                          <Text style={[styles.scanQuantityTitle, { color: colors.text }]} numberOfLines={1}>{scannedProduct.name}</Text>
                          <Text style={[styles.scanQuantityMeta, { color: colors.mutedForeground }]}>
                            Stock dispo : {getAvailableStock(scannedProduct)} - {scannedProduct.sellPrice.toLocaleString()} FCFA
                          </Text>
                        </View>
                      </View>

                      <View style={styles.scanQuantityStepper}>
                        <TouchableOpacity
                          style={[styles.scanQtyBtn, { backgroundColor: colors.muted }]}
                          onPress={() => setScanQuantityInput(value => `${Math.max(1, (parseInt(value, 10) || 1) - 1)}`)}
                        >
                          <Feather name="minus" size={18} color={colors.text} />
                        </TouchableOpacity>
                        <TextInput
                          style={[styles.scanQtyInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                          value={scanQuantityInput}
                          onChangeText={setScanQuantityInput}
                          keyboardType="numeric"
                          selectTextOnFocus
                        />
                        <TouchableOpacity
                          style={[styles.scanQtyBtn, { backgroundColor: colors.muted }]}
                          onPress={() => {
                            const next = (parseInt(scanQuantityInput, 10) || 0) + 1;
                            setScanQuantityInput(`${Math.min(next, getAvailableStock(scannedProduct))}`);
                          }}
                        >
                          <Feather name="plus" size={18} color={colors.text} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.scanQuickQtyRow}>
                        {[1, 2, 3, 5, 10].map(qty => (
                          <TouchableOpacity
                            key={qty}
                            style={[styles.scanQuickQtyBtn, { borderColor: colors.border, backgroundColor: colors.background }]}
                            onPress={() => setScanQuantityInput(`${Math.min(qty, getAvailableStock(scannedProduct))}`)}
                          >
                            <Text style={[styles.scanQuickQtyText, { color: colors.primary }]}>{qty}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <View style={styles.scanQuantityActions}>
                        <TouchableOpacity style={[styles.scanCancelBtn, { backgroundColor: colors.muted }]} onPress={cancelScannedProduct}>
                          <Text style={[styles.scanCancelText, { color: colors.text }]}>Annuler</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.scanAddBtn, { backgroundColor: colors.primary }]} onPress={addScannedProductToCart}>
                          <Text style={styles.scanAddText}>Ajouter</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </KeyboardAvoidingView>
                ) : cartCount > 0 && !unknownScannedCode ? (
                  <View style={[styles.scanCartPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.scanCartCopy}>
                      <Text style={[styles.scanCartTitle, { color: colors.text }]}>Panier en cours</Text>
                      <Text style={[styles.scanCartSubtitle, { color: colors.mutedForeground }]}>
                        {cartCount} article{cartCount > 1 ? "s" : ""} - {cartTotal.toLocaleString()} FCFA
                      </Text>
                    </View>
                    <TouchableOpacity style={[styles.scanCartAction, { backgroundColor: colors.primary }]} onPress={openCartFromScanner}>
                      <Text style={styles.scanCartActionText}>Voir</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {unknownScannedCode ? (
                  <View style={[styles.unknownPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={[styles.unknownIcon, { backgroundColor: colors.warning + "16" }]}>
                      <Feather name="alert-triangle" size={22} color={colors.warning} />
                    </View>
                    <Text style={[styles.unknownTitle, { color: colors.text }]}>Produit introuvable</Text>
                    <Text style={[styles.unknownText, { color: colors.mutedForeground }]}>
                      Ce code-barres n'est pas encore dans la boutique.
                    </Text>
                    <Text style={[styles.unknownCode, { color: colors.primary }]}>{unknownScannedCode}</Text>
                    <TouchableOpacity
                      style={[styles.unknownPrimaryBtn, { backgroundColor: colors.primary }]}
                      onPress={() => openAddProductFromScanner(unknownScannedCode)}
                      activeOpacity={0.85}
                    >
                      <Feather name="plus-circle" size={18} color="#fff" />
                      <Text style={styles.unknownPrimaryText}>Ajouter produit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.unknownSecondaryBtn, { backgroundColor: colors.muted }]}
                      onPress={() => {
                        setUnknownScannedCode("");
                        setScannedProduct(null);
                        setScanMessage("");
                        setTimeout(() => setScanLocked(false), 300);
                      }}
                      activeOpacity={0.8}
                    >
                      <Feather name="camera" size={17} color={colors.text} />
                      <Text style={[styles.unknownSecondaryText, { color: colors.text }]}>Scanner encore</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerCopy: { flex: 1, gap: 2 },
  kicker: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", textTransform: "uppercase" },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", fontWeight: "700" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cashierPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cashierTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  cashierCopy: { flex: 1, gap: 3 },
  cashierLabel: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", textTransform: "uppercase" },
  cashierTotal: { fontSize: 27, lineHeight: 33, fontFamily: "Inter_700Bold", fontWeight: "800" },
  cashierHint: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  cashierIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cashierActions: { flexDirection: "row", gap: 10 },
  cashierActionBtn: { flex: 1, minHeight: 46, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  cashierActionSecondary: { flex: 0.85 },
  cashierActionText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  searchTools: { flexDirection: "row", alignItems: "center", gap: 7 },
  codeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  summaryText: { fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  grid: { padding: 12 },
  row: { gap: 12 },
  productBtn: {
    flex: 1,
    minHeight: 150,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    gap: 9,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  productMediaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  addChip: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  productIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  productImage: { width: 52, height: 52, borderRadius: 14, backgroundColor: "#F1F5F9" },
  productName: { minHeight: 36, fontSize: 13, lineHeight: 18, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  productFooter: { marginTop: "auto", gap: 2 },
  productPrice: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  productStockPill: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  productStock: { fontSize: 11, fontFamily: "Inter_500Medium" },
  cartBar: {
    position: "absolute",
    bottom: 72,
    left: 16,
    right: 16,
    borderRadius: 16,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
    elevation: 8,
  },
  cartBarContent: { flexDirection: "row", alignItems: "center", padding: 14, gap: 11 },
  cartCount: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.24)", alignItems: "center", justifyContent: "center" },
  cartCountText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  cartBarText: { flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  cartBarTotal: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 18, borderBottomWidth: 1 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700" },
  modalSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  cartHeaderActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  closeBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  clearCartBtn: { minHeight: 44, borderRadius: 12, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  clearCartText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  cartItems: { flex: 1 },
  cartItem: { flexDirection: "row", alignItems: "center", padding: 13, borderRadius: 12, borderWidth: 1, gap: 12, marginBottom: 8 },
  cartItemInfo: { flex: 1, gap: 4 },
  cartItemName: { fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  cartItemPrice: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  cartItemUnit: { fontSize: 11, fontFamily: "Inter_400Regular" },
  qtyControls: { flexDirection: "row", alignItems: "center", gap: 10 },
  qtyBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  qtyText: { fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700", minWidth: 20, textAlign: "center" },
  modalFooter: { padding: 16, borderTopWidth: 1, gap: 12 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  totalAmount: { fontSize: 25, fontFamily: "Inter_700Bold", fontWeight: "700" },
  creditForm: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  creditTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  creditInputBox: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  creditInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  saleActions: { flexDirection: "row", gap: 10 },
  creditBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, borderRadius: 12, borderWidth: 1 },
  creditBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  confirmBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700", color: "#fff" },
  overlay: { flex: 1, backgroundColor: "rgba(15, 23, 18, 0.55)", alignItems: "center", justifyContent: "center", padding: 18 },
  quantityCard: { width: "100%", maxWidth: 420, borderWidth: 1, borderRadius: 16, padding: 16, gap: 16 },
  quantityHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  quantityIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  quantityInfo: { flex: 1, gap: 2 },
  quantityTitle: { fontSize: 17, fontFamily: "Inter_700Bold", fontWeight: "700" },
  quantityMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  quantityStepper: { flexDirection: "row", alignItems: "center", gap: 12 },
  bigQtyBtn: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  quantityInput: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 14,
    textAlign: "center",
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
  },
  quickQtyRow: { flexDirection: "row", gap: 8 },
  quickQtyBtn: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  quickQtyText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  addToCartBtn: { minHeight: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9 },
  addToCartText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scannerRoot: { flex: 1 },
  scannerBody: { flex: 1, padding: 16 },
  scannerCartBtn: { minWidth: 46, height: 38, borderRadius: 12, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
  scannerCartText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  permissionBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  permissionTitle: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  cameraWrap: { flex: 1, borderRadius: 18, overflow: "hidden" },
  camera: { flex: 1 },
  scanFrame: { position: "absolute", left: 52, right: 52, top: 120, height: 180, borderWidth: 3, borderColor: "#fff", borderRadius: 18 },
  torchBtn: { position: "absolute", top: 18, right: 18, minHeight: 38, borderRadius: 999, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, backgroundColor: "rgba(0,0,0,0.45)" },
  torchBtnActive: { backgroundColor: "rgba(5,150,105,0.85)" },
  torchText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scanHint: { position: "absolute", left: 20, right: 20, bottom: 28, alignItems: "center" },
  scanHintText: {
    color: "#fff",
    backgroundColor: "rgba(0,0,0,0.48)",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    fontWeight: "700",
    textAlign: "center",
  },
  scanCartPanel: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  scanCartCopy: { flex: 1, gap: 2 },
  scanCartTitle: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scanCartSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  scanCartAction: { minHeight: 38, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  scanCartActionText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scanQuantityPanelWrap: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
  },
  scanQuantityPanelWrapKeyboard: { bottom: 190 },
  scanQuantityPanel: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  scanQuantityHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  scanProductImage: { width: 48, height: 48, borderRadius: 13 },
  scanProductImageEmpty: { alignItems: "center", justifyContent: "center" },
  scanQuantityInfo: { flex: 1, gap: 2 },
  scanQuantityTitle: { fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scanQuantityMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  scanQuantityStepper: { flexDirection: "row", alignItems: "center", gap: 10 },
  scanQtyBtn: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  scanQtyInput: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 13, textAlign: "center", fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scanQuickQtyRow: { flexDirection: "row", gap: 7 },
  scanQuickQtyBtn: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  scanQuickQtyText: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scanQuantityActions: { flexDirection: "row", gap: 10 },
  scanCancelBtn: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  scanCancelText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  scanAddBtn: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  scanAddText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
  unknownPanel: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: "center",
    gap: 10,
  },
  unknownIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  unknownTitle: { fontSize: 18, fontFamily: "Inter_700Bold", fontWeight: "700" },
  unknownText: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center" },
  unknownCode: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "700" },
  unknownPrimaryBtn: { width: "100%", minHeight: 48, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  unknownPrimaryText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "700" },
  unknownSecondaryBtn: { width: "100%", minHeight: 44, borderRadius: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  unknownSecondaryText: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700" },
});
