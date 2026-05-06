import re

with open('frontend/app/[comercio]/catalogo/CatalogClient.tsx', 'r') as f:
    content = f.read()

# 1. Add selectedVariations state
state_match = re.search(r'const \[selectedProduct, setSelectedProduct\] = useState<any>\(null\);', content)
if state_match:
    content = content[:state_match.start()] + "const [selectedVariations, setSelectedVariations] = useState<{[key: string]: number}>({});\n  " + content[state_match.start():]

# 2. Modify mapping logic
# Replace `const imageUrl = getImageUrl(prod);` with variation logic
mapping_start = content.find('const imageUrl = getImageUrl(prod);')
if mapping_start != -1:
    replacement = """const vIdx = selectedVariations[prod.id] || 0;
                const selectedVar = prod.variations?.[vIdx];
                const imageUrl = selectedVar?.imageWebp || getImageUrl(prod);
                const cartId = prod.variations ? `${prod.id}_${vIdx}` : prod.id;
                const stock = selectedVar ? selectedVar.stock : 999;
                const isOut = prod.isHidden === true || stock === 0;"""
    content = content.replace("const imageUrl = getImageUrl(prod);\n                const itemsInCart = cart.filter(i => (i.baseId || i.id) === prod.id);\n                const inCartAqui = itemsInCart.find(i => i.modifier === 'aqui' || !i.modifier);\n                const inCartLlevar = itemsInCart.find(i => i.modifier === 'llevar');\n                const totalQty = itemsInCart.reduce((sum, i) => sum + Number(i.qty || 0), 0);\n                const activeCartItem = isRestaurant && !isDeliveryMode ? (consumptionMode === 'aqui' ? inCartAqui : inCartLlevar) : inCartAqui;\n                const isOut = prod.isHidden === true;", replacement + "\n                const itemsInCart = cart.filter(i => (i.baseId || i.id) === prod.id);\n                const inCartAqui = itemsInCart.find(i => i.id === cartId && (i.modifier === 'aqui' || !i.modifier));\n                const inCartLlevar = itemsInCart.find(i => i.id === cartId && i.modifier === 'llevar');\n                const totalQty = itemsInCart.reduce((sum, i) => sum + Number(i.qty || 0), 0);\n                const activeCartItem = isRestaurant && !isDeliveryMode ? (consumptionMode === 'aqui' ? inCartAqui : inCartLlevar) : inCartAqui;")

# 3. Add variations buttons
buttons_injection = """
                         {prod.variations && prod.variations.length > 1 && (
                             <div className="flex flex-wrap gap-1 mt-2">
                                 {prod.variations.map((v: any, idx: number) => (
                                     <button 
                                         key={idx} 
                                         onClick={(e) => { e.stopPropagation(); setSelectedVariations(prev => ({...prev, [prod.id]: idx})); }}
                                         className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${vIdx === idx ? 'bg-[var(--theme)] text-black border-[var(--theme)]' : 'bg-white/5 text-white/50 border-white/10 hover:text-white'}`}
                                     >
                                         {v.name}
                                     </button>
                                 ))}
                             </div>
                         )}
"""
content = content.replace('</div>\n\n                      {/* Add Button */}', buttons_injection + '\n                      </div>\n\n                      {/* Add Button */}')

# 4. addToCart logic update
old_add = """<button onClick={() => addToCart(prod, price)} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-colors">"""
new_add = """<button onClick={(e) => {
                                e.stopPropagation();
                                setCart(prev => {
                                    const existing = prev.find(i => i.id === cartId && (!isRestaurant || i.modifier === (consumptionMode === 'aqui' ? 'aqui' : 'llevar')));
                                    if (existing) {
                                        return prev.map(i => i === existing ? { ...i, qty: Number(i.qty) + 1 } : i);
                                    }
                                    return [...prev, { 
                                        ...prod, 
                                        id: cartId, 
                                        baseId: prod.id, 
                                        variationName: selectedVar?.name, 
                                        price, 
                                        qty: 1, 
                                        modifier: isRestaurant && !isDeliveryMode ? consumptionMode : undefined 
                                    }];
                                });
                            }} className="w-10 h-10 rounded-full flex items-center justify-center bg-white/10 text-white hover:bg-white/20 border border-white/10 transition-colors">"""
content = content.replace(old_add, new_add)

# 5. Fix setQty calls inside the Add Button block
content = content.replace("setQty(activeCartItem.id", "setQty(cartId")

with open('frontend/app/[comercio]/catalogo/CatalogClient.tsx', 'w') as f:
    f.write(content)

print("CatalogClient modified")
