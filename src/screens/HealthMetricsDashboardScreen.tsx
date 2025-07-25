import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Dimensions, ScrollView, SectionList } from 'react-native';
import {
  Text,
  Card,
  Title,
  Paragraph,
  useTheme,
  ActivityIndicator,
  Divider,
  Chip,
  FAB,
  SegmentedButtons,
} from 'react-native-paper';
import { LineChart } from "react-native-chart-kit";
// import { VictoryChart, VictoryLine, VictoryAxis, VictoryTheme, VictoryLegend, VictoryVoronoiContainer } from 'victory-native';
// import { Svg } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext.tsx';
import { supabase } from '../../lib/supabase';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { HealthMetricsStackParamList } from '../navigation/MainBottomTabNavigator';
import { subDays, format, parseISO, formatISO, startOfDay } from 'date-fns';

// Define a type for the combined health metric data we expect to fetch
interface DisplayHealthMetric {
  id: string;
  recorded_at: string;
  category_name: string; // This will be normalized for charting (e.g., "Blood Pressure")
  original_category_name?: string; // e.g., "Blood Pressure Systolic" for display in lists
  category_unit: string | null;
  value: number; 
  notes: string | null;
  systolic?: number;
  diastolic?: number;
  _displayValue?: string;
}

interface ChartKitData {
  labels: string[];
  datasets: {
    data: number[];
    color?: (opacity: number) => string;
    strokeWidth?: number;
    legend?: string; // For multi-line charts like blood pressure
  }[];
  legend?: string[]; // Optional top-level legend for the chart
}

interface ProcessedChart {
  categoryName: string; 
  unit: string | null;
  chartData: ChartKitData | null; // Null if not enough data
}

interface MetricHistorySection {
  title: string; // Date string e.g., "May 27, 2025"
  data: DisplayHealthMetric[];
}

const screenWidth = Dimensions.get('window').width;

// Correct navigation prop type for this screen, which is part of HealthMetricsStack
type HealthMetricsDashboardScreenNavigationProp = StackNavigationProp<
  HealthMetricsStackParamList,
  'HealthMetricsDashboard' // This screen's name within its own stack
>;

type TimePeriod = '7D' | '30D' | 'All';

const HealthMetricsDashboardScreen: React.FC = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<HealthMetricsDashboardScreenNavigationProp>();
  const [rawMetrics, setRawMetrics] = useState<DisplayHealthMetric[]>([]);
  const [metricHistorySections, setMetricHistorySections] = useState<MetricHistorySection[]>([]);
  const [processedChartData, setProcessedChartData] = useState<ProcessedChart[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState<TimePeriod>('7D');

  const processMetricsForDisplayAndChart = useCallback(() => {
    if (!user || rawMetrics.length === 0) {
      setMetricHistorySections([]);
      setProcessedChartData([]);
      return;
    }

    // Define the exact normalized category names we want charts for
    const desiredChartCategories = ["Weight", "Blood Pressure", "Blood Sugar", "Sleep"];

    const now = new Date();
    let startDate: Date;

    if (selectedTimePeriod === '7D') {
      startDate = startOfDay(subDays(now, 6));
    } else if (selectedTimePeriod === '30D') {
      startDate = startOfDay(subDays(now, 29));
    } else { // 'All'
      startDate = new Date(0);
    }

    const metricsInPeriod = rawMetrics.filter(metric => {
      const metricDate = parseISO(metric.recorded_at);
      return metricDate >= startDate;
    });

    // For Charts (sorted ascending by date)
    const metricsForChart = [...metricsInPeriod].sort((a, b) => parseISO(a.recorded_at).getTime() - parseISO(b.recorded_at).getTime());

    const processedMetrics: DisplayHealthMetric[] = [];

    // First, process and normalize all metrics
    metricsForChart.forEach(dbMetric => {
      let normalizedCategoryName = dbMetric.category_name;
      let displayValue = dbMetric._displayValue || dbMetric.value.toString();

      if (dbMetric.category_name.toLowerCase().includes('systolic') || dbMetric.category_name.toLowerCase().includes('diastolic')) {
        normalizedCategoryName = 'Blood Pressure'; 
        // Display value for BP will be handled by grouping later if needed for a list, or shown as individual components
      } else if (dbMetric.category_name.toLowerCase().includes('glucose') || dbMetric.category_name.toLowerCase().includes('sugar')) {
        normalizedCategoryName = 'Blood Sugar';
      } else if (dbMetric.category_name.toLowerCase().includes('sleep duration')) { // Normalize Sleep Duration
        normalizedCategoryName = 'Sleep';
      }
      // Weight will keep its name "Weight"

      processedMetrics.push({
        id: dbMetric.id,
        recorded_at: dbMetric.recorded_at,
        category_name: normalizedCategoryName, // Use the normalized name
        original_category_name: dbMetric.original_category_name, // Keep original for list display if needed
        category_unit: dbMetric.category_unit,
        value: dbMetric.value, // This is the primary value from the DB row
        systolic: dbMetric.systolic, // Directly use the pre-parsed systolic value from fetchRawMetrics
        diastolic: dbMetric.diastolic, // Directly use the pre-parsed diastolic value from fetchRawMetrics
        notes: dbMetric.notes,
        _displayValue: displayValue,
      });
    });

    // Group metrics by the *normalized* category name for charting
    const groupedForCharts = processedMetrics.reduce((acc, m) => {
      if (!acc[m.category_name]) {
        acc[m.category_name] = [];
      }
      acc[m.category_name].push(m);
      return acc;
    }, {} as Record<string, DisplayHealthMetric[]>);

    // Create chart data only for desired categories
    const chartDataArray: ProcessedChart[] = Object.keys(groupedForCharts)
      .filter(categoryName => desiredChartCategories.includes(categoryName)) // Exact match on normalized names
      .map(categoryName => {
        const metricsForCategory = groupedForCharts[categoryName].sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
        const unit = metricsForCategory.length > 0 ? metricsForCategory[0].category_unit : '';

        let labels: string[] = [];
        let datasets: ChartKitData['datasets'] = [];

        if (categoryName === 'Blood Pressure') {
          const pairedBPData: { recorded_at: string, systolic: number, diastolic: number }[] = [];
          const tempSys: Record<string, number> = {};
          const tempDia: Record<string, number> = {};
          const allTimestamps = new Set<string>();

          // Collect all SBP and DBP readings, mapping them by a precise timestamp
          metricsForCategory.forEach(m => {
            // Use a consistent, precise timestamp string as the key for pairing
            // m.recorded_at is already an ISO string from Supabase
            const ts = formatISO(parseISO(m.recorded_at)); // Ensures a standardized ISO string key
            allTimestamps.add(ts);
            if (m.systolic !== undefined) {
              tempSys[ts] = m.systolic;
            }
            if (m.diastolic !== undefined) {
              tempDia[ts] = m.diastolic;
            }
          });

          // Iterate through sorted unique timestamps and create pairs
          Array.from(allTimestamps).sort((a,b) => parseISO(a).getTime() - parseISO(b).getTime()).forEach(tsKey => {
            if (tempSys[tsKey] !== undefined && tempDia[tsKey] !== undefined) {
              pairedBPData.push({
                recorded_at: tsKey, // Store the ISO string timestamp
                systolic: tempSys[tsKey],
                diastolic: tempDia[tsKey]
              });
            }
          });
          
          if (pairedBPData.length > 0) {
            labels = pairedBPData.map(bp => format(parseISO(bp.recorded_at), 'MM/dd'));
            datasets.push({
              data: pairedBPData.map(bp => bp.systolic),
              color: (opacity = 1) => theme.colors.primary,
              strokeWidth: 2,
              legend: "Systolic"
            });
            datasets.push({
              data: pairedBPData.map(bp => bp.diastolic),
              color: (opacity = 1) => theme.colors.error,
              strokeWidth: 2,
              legend: "Diastolic"
            });
          }
        } else {
          const dataPoints: number[] = [];
          const catLabels: string[] = [];
          metricsForCategory.forEach(m => {
            if (typeof m.value === 'number' && !isNaN(m.value)) {
              dataPoints.push(m.value);
              catLabels.push(format(parseISO(m.recorded_at), 'MM/dd'));
            }
          });
          if (catLabels.length > 0) {
            labels = catLabels;
            datasets.push({
              data: dataPoints,
              color: (opacity = 1) => theme.colors.primary,
              strokeWidth: 2
            });
          }
        }

        if (labels.length === 0) { 
          return { categoryName, unit, chartData: null };
        }
        return {
          categoryName,
          unit,
          chartData: {
            labels: labels,
            datasets: datasets,
            legend: categoryName === 'Blood Pressure' ? ['Systolic', 'Diastolic'] : undefined
          }
        };
      }).filter(pc => pc !== null && pc.chartData !== null && pc.chartData.labels.length > 0) as ProcessedChart[];
    setProcessedChartData(chartDataArray);

    // For History List (sorted descending by date, then grouped)
    const metricsForHistoryList = [...metricsInPeriod].sort((a, b) => parseISO(b.recorded_at).getTime() - parseISO(a.recorded_at).getTime());
    const groupedByDay: { [key: string]: DisplayHealthMetric[] } = {};
    metricsForHistoryList.forEach(metric => {
      const dayKey = format(parseISO(metric.recorded_at), 'yyyy-MM-dd');
      if (!groupedByDay[dayKey]) {
        groupedByDay[dayKey] = [];
      }
      groupedByDay[dayKey].push(metric);
    });

    const sections: MetricHistorySection[] = Object.keys(groupedByDay)
      .sort((a, b) => b.localeCompare(a))
      .map(dayKey => {
        const dayMetrics = groupedByDay[dayKey];
        const latestMetricsPerCategory: { [category: string]: DisplayHealthMetric } = {};

        // Iterate through metrics for the day to find the latest for each category
        // Since dayMetrics is already sorted with newest first for the day (due to initial sort of metricsForHistoryList)
        // the first one we encounter for a category is the latest for that category on that day.
        dayMetrics.forEach(metric => {
          if (!latestMetricsPerCategory[metric.category_name]) {
            latestMetricsPerCategory[metric.category_name] = metric;
          }
        });

        return {
          title: format(parseISO(dayKey), 'MMMM d, yyyy'),
          data: Object.values(latestMetricsPerCategory).sort((a, b) => parseISO(b.recorded_at).getTime() - parseISO(a.recorded_at).getTime()), // keep overall latest first within the day
        };
      }).filter(section => section.data.length > 0); // Ensure sections with no data (after filtering) are not shown
    setMetricHistorySections(sections);
  }, [user, rawMetrics, selectedTimePeriod, theme.colors.primary, theme.colors.error]);

  const fetchRawMetrics = useCallback(async () => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoading(true);
    try {
    const { data, error } = await supabase
      .from('health_metrics')
      .select(`
        id,
        recorded_at,
        value,
        notes,
          health_metric_categories (id, name, unit)
      `)
      .eq('patient_id', user.id)
      .order('recorded_at', { ascending: false });

      if (error) throw error;

      const newRawMetrics: DisplayHealthMetric[] = data.map((metric: any) => {
        const originalCategoryName = metric.health_metric_categories?.name;
        let currentCategoryName = originalCategoryName;
        let displayValue;
        let parsedSystolic: number | undefined;
        let parsedDiastolic: number | undefined;
        const metricValue = parseFloat(metric.value);

        if (originalCategoryName === 'Blood Pressure Systolic') {
          currentCategoryName = 'Blood Pressure';
          parsedSystolic = metricValue;
          displayValue = `${parsedSystolic} ${metric.health_metric_categories?.unit || ''}`.trim();
        } else if (originalCategoryName === 'Blood Pressure Diastolic') {
          currentCategoryName = 'Blood Pressure';
          parsedDiastolic = metricValue;
          displayValue = `${parsedDiastolic} ${metric.health_metric_categories?.unit || ''}`.trim();
        } else if (originalCategoryName === 'Blood Pressure') {
          // Logic for parsing SBP/DBP from notes if category_name is "Blood Pressure"
          if (metric.notes) {
            const parts = metric.notes.match(/(\d+(\.\d+)?)/g);
            if (parts && parts.length > 0) {
              if (String(metric.value).includes('/') && parts.length >= 2) {
                parsedSystolic = parseFloat(parts[0]);
                parsedDiastolic = parseFloat(parts[1]);
              } else if (metric.notes.toLowerCase().includes('diastolic:') && parts.length >= 1) {
                parsedSystolic = metricValue;
                parsedDiastolic = parseFloat(parts.find(p => !isNaN(parseFloat(p))) || "0");
              } else if (metric.notes.toLowerCase().includes('sys:') && parts.length >= 1) {
                parsedDiastolic = metricValue; // Assuming value is DBP if sys is in notes
                parsedSystolic = parseFloat(parts.find(p => !isNaN(parseFloat(p))) || "0");
              } else if (parts.length === 2) {
                const p1 = parseFloat(parts[0]);
                const p2 = parseFloat(parts[1]);
                // If metric.value is one of them, assume it's SBP and other is DBP
                if (metricValue === p1) {
                    parsedSystolic = p1;
                    parsedDiastolic = p2;
                } else if (metricValue === p2) {
                    parsedSystolic = p2; // Or p1 is SBP and p2 is DBP, metricValue was DBP
                    parsedDiastolic = p1; 
                } else { // Default: assume first is SBP, second is DBP
                    parsedSystolic = p1;
                    parsedDiastolic = p2;
                }
                 // If metricValue doesn't match parsedSystolic, re-evaluate based on common patterns
                if (parsedSystolic && parsedDiastolic && metricValue !== parsedSystolic && metricValue === parsedDiastolic) {
                    // If metricValue matches parsedDiastolic, but not parsedSystolic, swap them
                    // This case is tricky without more context on how notes are structured
                    // A common case: value=120, notes="D:80" -> S=120, D=80
                    // value=80, notes="S:120" -> S=120, D=80
                } else if (parsedSystolic && metricValue !== parsedSystolic) {
                     parsedSystolic = metricValue; // Prioritize metric.value as SBP if parts are ambiguous
                }

              } else if (parts.length === 1) {
                const noteVal = parseFloat(parts[0]);
                if (metric.notes.toLowerCase().includes('diastolic')) {
                    parsedSystolic = metricValue;
                    parsedDiastolic = noteVal;
                } else if (metric.notes.toLowerCase().includes('systolic')) {
                    parsedDiastolic = metricValue;
                    parsedSystolic = noteVal;
                } else { // Ambiguous single number in notes
                    parsedSystolic = metricValue;
                    parsedDiastolic = noteVal; // Assume notes is DBP
                }
              } else {
                parsedSystolic = metricValue;
              }
            } else { // No parsable numbers in notes
              parsedSystolic = metricValue;
            }
          } else { // No notes for "Blood Pressure" category
            parsedSystolic = metricValue;
          }
          
          // Construct displayValue for Blood Pressure
          if (parsedSystolic !== undefined && parsedDiastolic !== undefined) {
            displayValue = `${parsedSystolic}/${parsedDiastolic} ${metric.health_metric_categories?.unit || ''}`.trim();
          } else if (parsedSystolic !== undefined) {
            displayValue = `${parsedSystolic} ${metric.health_metric_categories?.unit || ''}`.trim();
          } else if (parsedDiastolic !== undefined) { // Should be rare if SBP is primary
            displayValue = `?/${parsedDiastolic} ${metric.health_metric_categories?.unit || ''}`.trim();
          } else {
            displayValue = `${metricValue} ${metric.health_metric_categories?.unit || ''}`.trim();
          }
        } else { // Other categories
          displayValue = `${metricValue} ${metric.health_metric_categories?.unit || ''}`.trim();
        }

        return {
          id: metric.id,
          recorded_at: metric.recorded_at,
          category_name: currentCategoryName || 'Unknown Category',
          original_category_name: (originalCategoryName && originalCategoryName !== currentCategoryName) ? originalCategoryName : undefined,
          category_unit: metric.health_metric_categories?.unit,
          value: metricValue,
          systolic: parsedSystolic,
          diastolic: parsedDiastolic,
          notes: metric.notes,
          _displayValue: displayValue,
        };
      });
      setRawMetrics(newRawMetrics);
    } catch (error) {
      console.error('Error fetching health metrics:', error);
      setRawMetrics([]);
    } finally {
    setLoading(false);
    setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchRawMetrics();
  }, [fetchRawMetrics]);
  
  useEffect(() => {
    processMetricsForDisplayAndChart();
  }, [rawMetrics, selectedTimePeriod, processMetricsForDisplayAndChart]);

  useFocusEffect(
    useCallback(() => {
      fetchRawMetrics();
    }, [fetchRawMetrics])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchRawMetrics();
  };

  const renderMetricItem = ({ item }: { item: DisplayHealthMetric }) => {
    return (
    <Card style={styles.card}>
      <Card.Content>
          <Title style={{color: theme.colors.primary}}>{item.original_category_name || item.category_name}</Title>
          <Paragraph style={{fontSize: 18, fontWeight: 'bold', color: theme.colors.secondary}}>
            {item._displayValue}
          </Paragraph>
          <Text style={{fontSize: 12, color: theme.colors.onSurfaceVariant}}>
            {new Date(item.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          {item.notes && !(item.category_name === 'Blood Pressure' && item.notes.match(/(\d+)\/(\d+)/)) && (
            <Text style={{marginTop: 5, color: theme.colors.onSurfaceVariant}}>Notes: {item.notes}</Text>
          )}
        </Card.Content>
      </Card>
    );
  };

  const renderChartItem = ({ item }: { item: ProcessedChart }) => {
    if (!item.chartData || item.chartData.labels.length === 0) {
      return (
        <Card style={styles.chartCard}>
          <Card.Title title={`${item.categoryName} Trend`} />
          <Card.Content>
            <Text style={{color: theme.colors.onSurfaceVariant}}>Not enough data to display chart for {selectedTimePeriod} period.</Text>
          </Card.Content>
        </Card>
      );
    }

    return (
      <Card style={styles.chartCard}>
        <Card.Title 
          title={`${item.categoryName === 'Blood Sugar' ? 'Sugar' : item.categoryName} Trend (${item.unit || ''})`} 
          subtitle={`Last ${selectedTimePeriod === '7D' ? '7 Days' : selectedTimePeriod === '30D' ? '30 Days' : 'All Time'}`} 
        />
        <Card.Content>
          <LineChart
            data={item.chartData}
            width={item.categoryName === 'Weight' ? screenWidth - 64 : screenWidth - 70}
            height={220}
            yAxisLabel=" "
            yAxisSuffix={item.unit ? ` ${item.unit}` : ""}
            chartConfig={{
              backgroundColor: theme.colors.surface,
              backgroundGradientFrom: theme.colors.surfaceVariant,
              backgroundGradientTo: theme.colors.surfaceVariant,
              decimalPlaces: item.categoryName === 'Blood Pressure' ? 0 : 1,
              color: (opacity = 1) => theme.colors.primary,
              labelColor: (opacity = 1) => theme.colors.onSurfaceVariant,
              style: {
                borderRadius: 16,
              },
              propsForDots: {
                r: "4",
                strokeWidth: "1",
                stroke: theme.colors.primary
              },
              propsForBackgroundLines: {
                stroke: theme.colors.outlineVariant,
                strokeDasharray: "",
              },
              segments: item.categoryName === 'Weight' ? undefined : 4,
              fromZero: item.categoryName !== 'Weight',
              propsForLabels: {
                dx: item.categoryName === 'Weight' ? 0 :
                    item.categoryName === 'Sugar' ? 35 : // Incremental nudge for Sugar
                    10, // Default nudge for BP, Sleep, and others not Weight
              }
            }}
            bezier
            style={{
              marginVertical: 8,
              borderRadius: 16,
            }}
            verticalLabelRotation={item.chartData.labels.length > 7 ? 30 : 0}
            hidePointsAtIndex={[]}
            renderDotContent={({x, y, index, indexData}) => {
              return null;
            }}
          />
          {item.chartData.datasets.length > 1 && item.chartData.legend && (
            <View style={styles.legendContainer}>
              {item.chartData.datasets.map((dataset, index) => (
                <View key={index} style={styles.legendItem}>
                  <View style={[styles.legendColorBox, { backgroundColor: dataset.color ? dataset.color(1) : theme.colors.primary }]} />
                  <Text style={{color: theme.colors.onSurface}}>{dataset.legend || `Dataset ${index + 1}`}</Text>
                </View>
              ))}
        </View>
        )}
      </Card.Content>
    </Card>
  );
  };

  if (loading && !refreshing && rawMetrics.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator animating={true} size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.onBackground }}>Loading metrics...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Text style={{color: theme.colors.onBackground}}>Please log in to view health metrics.</Text>
      </View>
    );
  }
  
  if (rawMetrics.length === 0 && !loading && !refreshing) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Text style={{color: theme.colors.onBackground}}>No health metrics recorded yet.</Text>
        <Text style={{color: theme.colors.onBackground}}>Pull down to refresh or log new metrics.</Text>
         <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surface} /> 
         <FAB
            style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
            icon="plus"
            color={theme.colors.onPrimaryContainer}
            onPress={() => navigation.navigate('LogHealthMetric')}
          />
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: theme.colors.background}]}>
      <SegmentedButtons
        value={selectedTimePeriod}
        onValueChange={(value) => setSelectedTimePeriod(value as TimePeriod)}
        buttons={[
          { value: '7D', label: '7 Days' },
          { value: '30D', label: '30 Days' },
          { value: 'All', label: 'All Time' },
        ]}
        style={styles.segmentedButtons}
      />
    <FlatList
        data={processedChartData}
        renderItem={renderChartItem}
        keyExtractor={(item, index) => `chart-${item.categoryName}-${index}`}
        ListHeaderComponent={
            processedChartData.length > 0 ? (
                <Text style={[styles.headerTitle, {color: theme.colors.onSurface}]}>Metric Charts</Text>
            ) : null
        }
        ListEmptyComponent={
            !loading && !refreshing && processedChartData.length === 0 ? (
                <View style={styles.centered}>
                    <Text style={[styles.emptyMessage, {color: theme.colors.onSurfaceVariant}]}>
                        No chart data available for the selected period.
                    </Text>
                    <Text style={[styles.emptyMessage, {color: theme.colors.onSurfaceVariant, fontSize: 12}]}>
                        Try selecting a different time period or log more data.
                    </Text>
                </View>
            ) : null
        }
        ListFooterComponent={
          <SectionList
            sections={metricHistorySections}
            keyExtractor={(item, index) => `history-${item.id}-${index}`}
            renderItem={renderMetricItem}
            renderSectionHeader={({ section: { title } }) => (
              <Text style={[styles.sectionHeaderBase, { backgroundColor: theme.colors.elevation.level2, color: theme.colors.onSurfaceVariant }]}>{title}</Text>
            )}
            ListHeaderComponent={
                metricHistorySections.length > 0 ? (
                    <Text style={[styles.headerTitle, {color: theme.colors.onSurface, marginTop:20 }]}>Metric History ({selectedTimePeriod === '7D' ? 'Last 7 Days' : selectedTimePeriod === '30D' ? 'Last 30 Days' : 'All Time'})</Text>
                ) : null
            }
            ListEmptyComponent={
                !loading && !refreshing && metricHistorySections.length === 0 ? (
                     <Text style={[styles.emptyMessage, {color: theme.colors.onSurfaceVariant}]}>No metrics recorded for this period.</Text>
                ) : null
            }
            scrollEnabled={false}
            contentContainerStyle={{ paddingBottom: 80 }}
          />
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surface} />
        }
      />
      <FAB
        style={[styles.fab, { backgroundColor: theme.colors.primaryContainer }]}
        icon="plus"
        color={theme.colors.onPrimaryContainer}
        onPress={() => navigation.navigate('LogHealthMetric')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    flex: 1,
  },
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2,
  },
  chartCard: {
    marginVertical: 10,
    marginHorizontal: 16,
    elevation: 2,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 10,
    marginLeft: 16,
  },
  sectionHeaderBase: {
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  emptyMessage: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 14,
    paddingHorizontal: 20,
  },
  segmentedButtons: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 5,
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  legendColorBox: {
    width: 12,
    height: 12,
    marginRight: 6,
  }
});

export default HealthMetricsDashboardScreen; 