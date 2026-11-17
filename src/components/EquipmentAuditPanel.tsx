import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { analyzeEquipmentAudit } from '../services/equipmentAudit';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

interface Props {
  rows: any[];
}

export function EquipmentAuditPanel({ rows }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const [expandedInvalid, setExpandedInvalid] = useState<Record<string, boolean>>({});
  const items = analyzeEquipmentAudit(rows);

  if (items.length === 0) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <MaterialIcons name="fact-check" size={20} color={colors.primarySoftText} />
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>Conferência de equipamentos e seriais</Text>
          <Text style={styles.subtitle}>
            Compare a quantidade instalada com os seriais informados.
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {items.map((item) => {
          const isOpen = Boolean(expandedInvalid[item.key]);
          return (
            <View
              key={item.key}
              style={[
                styles.itemCard,
                item.matches ? styles.itemMatched : styles.itemNeedsReview,
              ]}
            >
              <View style={styles.itemHeaderRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    item.matches ? styles.badgeMatched : styles.badgeReview,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      item.matches ? styles.statusTextMatched : styles.statusTextReview,
                    ]}
                  >
                    {item.status}
                  </Text>
                </View>
              </View>

              <Text style={styles.metricsText}>
                Quantidade instalada:{' '}
                <Text style={styles.bold}>
                  {item.quantity !== null ? String(item.quantity) : 'Não informada'}
                </Text>{' '}
                · Seriais identificados: <Text style={styles.bold}>{item.count}</Text>
              </Text>

              <Text style={styles.hintText}>
                {item.allowedSerialLengths.join(' ou ')} caracteres por serial · separe com ; ou
                uma linha por equipamento.
              </Text>

              {item.uniqueCount !== item.count && (
                <Text style={styles.warningText}>
                  ⚠️ {item.count - item.uniqueCount} serial(is) repetido(s).
                </Text>
              )}

              {item.invalid.length > 0 && (
                <View style={styles.invalidBox}>
                  <TouchableOpacity
                    style={styles.invalidHeader}
                    onPress={() =>
                      setExpandedInvalid((prev) => ({
                        ...prev,
                        [item.key]: !prev[item.key],
                      }))
                    }
                  >
                    <Text style={styles.invalidSummary}>
                      {item.invalid.length} entrada(s) com formato inválido
                    </Text>
                    <MaterialIcons
                      name={isOpen ? 'expand-less' : 'expand-more'}
                      size={18}
                      color={colors.warningText}
                    />
                  </TouchableOpacity>
                  {isOpen && (
                    <Text style={styles.invalidList}>{item.invalid.join('\n')}</Text>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  panel: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerTextCol: {
    marginLeft: 8,
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  subtitle: {
    fontSize: 12,
    color: '#718096',
  },
  grid: {
    gap: 8,
  },
  itemCard: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
  },
  itemMatched: {
    backgroundColor: '#F0FFF4',
    borderColor: '#9AE6B4',
  },
  itemNeedsReview: {
    backgroundColor: '#FFFAF0',
    borderColor: '#FBD38D',
  },
  itemHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeMatched: {
    backgroundColor: '#C6F6D5',
  },
  badgeReview: {
    backgroundColor: '#FEEBC8',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  statusTextMatched: {
    color: '#22543D',
  },
  statusTextReview: {
    color: '#7B341E',
  },
  metricsText: {
    fontSize: 13,
    color: '#2D3748',
    marginBottom: 2,
  },
  bold: {
    fontWeight: 'bold',
  },
  hintText: {
    fontSize: 11,
    color: '#718096',
  },
  warningText: {
    fontSize: 12,
    color: '#C05621',
    fontWeight: '600',
    marginTop: 4,
  },
  invalidBox: {
    marginTop: 6,
    backgroundColor: 'rgba(251, 211, 141, 0.3)',
    borderRadius: 6,
    padding: 8,
  },
  invalidHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  invalidSummary: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#9C4221',
  },
  invalidList: {
    fontSize: 11,
    color: '#7B341E',
    marginTop: 4,
    fontFamily: 'monospace',
  },
});
