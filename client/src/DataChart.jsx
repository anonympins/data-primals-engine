import React from 'react';
import PropTypes from 'prop-types';
import { Bar, Doughnut, Pie, Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    Title,
    Filler // Import Filler for line chart area fill
} from 'chart.js';
import { useTranslation } from 'react-i18next'; // Optional: for default title

// Register all necessary components for the chart types we want to support
ChartJS.register(
    ArcElement,          // For Pie/Doughnut
    Tooltip,
    Legend,
    CategoryScale,       // For Bar/Line (X-axis)
    LinearScale,         // For Bar/Line (Y-axis)
    BarElement,          // For Bar
    PointElement,        // For Line
    LineElement,         // For Line
    Title,               // For Chart Title
    Filler               // For Line chart area fill
);

// --- Default Options ---

const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false, // Allows controlling height/width ratio via container
    plugins: {
        legend: {
            position: 'top', // Sensible default legend position
        },
        title: {
            display: true,   // Display title by default
            text: 'Chart Title', // Default title text
        },
        tooltip: {
            mode: 'index',
            intersect: false,
        },
    },
    scales: { // Default scales (primarily for Bar/Line)
        x: {
            display: true,
            title: {
                display: false, // No default X-axis title
                text: 'X Axis',
            },
            ticks: {
                // Auto-skip ticks if they overlap
                autoSkip: true,
                maxRotation: 45, // Rotate labels slightly if needed
                minRotation: 0,
            }
        },
        y: {
            display: true,
            title: {
                display: false, // No default Y-axis title
                text: 'Y Axis',
            },
            beginAtZero: true, // Start Y-axis at 0 by default
        },
    },
};

// Specific defaults for Pie/Doughnut (no scales)
const pieDoughnutDefaults = {
    scales: undefined, // Remove scales for Pie/Doughnut
};

// Specific defaults for Line (tension)
const lineDefaults = {
    tension: 0.1, // Slight curve for line charts
};

// --- Helper Functions ---

/**
 * Generates a palette of distinct colors.
 * @param {number} count - Number of colors needed.
 * @returns {string[]} An array of hex color strings.
 */
const generateDefaultColors = (count) => {
    const colors = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
        '#FFCD56', '#C9CBCF', '#3FC77D', '#E7E9ED', '#77DD77', '#FDFD96',
        '#84B4E8', '#F49AC2', '#FAA460', '#B19CD9', '#FFB347', '#FFD1DC'
    ];
    // Repeat colors if more are needed than the base palette
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(colors[i % colors.length]);
    }
    return result;
};

/**
 * Merges user-provided options with default options.
 * @param {object} userOptions - Options provided via props.
 * @param {string} chartType - The type of chart ('bar', 'line', 'pie', 'doughnut').
 * @returns {object} The merged options object.
 */
const mergeOptions = (userOptions, chartType, defaultTitle) => {
    let baseDefaults = { ...defaultOptions };

    // Apply type-specific defaults
    if (chartType === 'pie' || chartType === 'doughnut') {
        baseDefaults = { ...baseDefaults, ...pieDoughnutDefaults };
    }
    if (chartType === 'line') {
        baseDefaults = { ...baseDefaults, ...lineDefaults };
    }

    // Deep merge (simple version, consider lodash.merge for complex cases)
    const merged = {
        ...baseDefaults,
        ...userOptions,
        plugins: {
            ...baseDefaults.plugins,
            ...(userOptions?.plugins),
            title: {
                ...baseDefaults.plugins?.title,
                text: userOptions?.plugins?.title?.text ?? defaultTitle ?? baseDefaults.plugins?.title?.text, // Prioritize user title, then default prop, then base default
                display: userOptions?.plugins?.title?.display ?? (!!(userOptions?.plugins?.title?.text ?? defaultTitle)), // Display title if text is provided
                ...(userOptions?.plugins?.title),
            },
            legend: {
                ...baseDefaults.plugins?.legend,
                ...(userOptions?.plugins?.legend),
            },
            tooltip: {
                ...baseDefaults.plugins?.tooltip,
                ...(userOptions?.plugins?.tooltip),
            },
        },
        scales: { // Merge scales carefully
            x: {
                ...baseDefaults.scales?.x,
                ...(userOptions?.scales?.x),
                title: {
                    ...baseDefaults.scales?.x?.title,
                    ...(userOptions?.scales?.x?.title),
                },
                ticks: {
                    ...baseDefaults.scales?.x?.ticks,
                    ...(userOptions?.scales?.x?.ticks),
                }
            },
            y: {
                ...baseDefaults.scales?.y,
                ...(userOptions?.scales?.y),
                title: {
                    ...baseDefaults.scales?.y?.title,
                    ...(userOptions?.scales?.y?.title),
                },
                ticks: {
                    ...baseDefaults.scales?.y?.ticks,
                    ...(userOptions?.scales?.y?.ticks),
                }
            },
            // Allow adding other scales (e.g., y1 for dual-axis)
            ...(userOptions?.scales),
        }
    };

    // Remove scales entirely if chart type doesn't use them
    if (chartType === 'pie' || chartType === 'doughnut') {
        delete merged.scales;
    }


    return merged;
};

/**
 * Prepares the data object for Chart.js, ensuring default colors if needed.
 * @param {object} chartData - The data object provided via props ({ labels: [], datasets: [] }).
 * @returns {object} The prepared data object.
 */
const prepareData = (chartData) => {
    if (!chartData || !chartData.datasets) {
        return { labels: [], datasets: [] }; // Return empty structure if data is invalid
    }

    const preparedDatasets = chartData.datasets.map((dataset, index) => {
        const dataLength = dataset.data?.length || 0;
        const needsColor = !dataset.backgroundColor;
        const needsBorderColor = !dataset.borderColor; // Often useful for Line charts

        // Generate default colors only if backgroundColor is missing
        const defaultBgColors = needsColor ? generateDefaultColors(dataLength) : undefined;
        // Use a single border color by default for line charts if not provided
        const defaultBorderColor = needsBorderColor && defaultBgColors ? defaultBgColors[index % defaultBgColors.length] : undefined;

        return {
            ...dataset,
            backgroundColor: dataset.backgroundColor ?? defaultBgColors,
            borderColor: dataset.borderColor ?? defaultBorderColor,
            // Add hover colors slightly darker/lighter than base colors if not provided
            hoverBackgroundColor: dataset.hoverBackgroundColor ?? dataset.backgroundColor ?? defaultBgColors,
            hoverBorderColor: dataset.hoverBorderColor ?? dataset.borderColor ?? defaultBorderColor,
        };
    });

    return {
        ...chartData,
        datasets: preparedDatasets,
    };
};


// --- DataChart Component ---

export const DataChart = ({ type = 'bar', data, options = {}, title, className = '', height = '300px', width = '100%' }) => {
    const { t } = useTranslation(); // Optional i18n

    // Basic validation
    if (!data || !data.labels || !data.datasets || data.datasets.length === 0) {
        console.warn("DataChart: Invalid or empty 'data' prop provided.", data);
        return <div className={`data-chart-container ${className}`} style={{ height, width, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc' }}>{t('dashboards.no_data_chart') || 'No data available for chart'}</div>;
    }

    const chartType = type.toLowerCase();
    const defaultTitleText = title ?? t(`dashboards.chart_title_${chartType}`) ?? `Chart (${chartType})`; // Example i18n key
    const finalOptions = mergeOptions(options, chartType, defaultTitleText);
    const finalData = prepareData(data);

    let ChartComponent;
    switch (chartType) {
        case 'doughnut':
            ChartComponent = Doughnut;
            break;
        case 'pie':
            ChartComponent = Pie;
            break;
        case 'line':
            ChartComponent = Line;
            break;
        case 'bar':
        default: // Default to Bar chart
            ChartComponent = Bar;
            break;
    }

    return (
        <div className={`data-chart-container ${className}`} style={{ position: 'relative', height, width }}>
            <ChartComponent options={finalOptions} data={finalData} />
        </div>
    );
};

// --- PropTypes ---

DataChart.propTypes = {
    /** The type of chart to render */
    type: PropTypes.oneOf(['bar', 'line', 'pie', 'doughnut']),
    /** Chart data in Chart.js format ({ labels: [], datasets: [{ label, data, backgroundColor?, borderColor?, ... }] }) */
    data: PropTypes.shape({
        labels: PropTypes.arrayOf(PropTypes.string).isRequired,
        datasets: PropTypes.arrayOf(PropTypes.shape({
            label: PropTypes.string,
            data: PropTypes.arrayOf(PropTypes.number).isRequired,
            backgroundColor: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
            borderColor: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
            // ... other dataset options allowed by Chart.js
        })).isRequired,
    }).isRequired,
    /** Chart.js options object. Will be merged with sensible defaults. */
    options: PropTypes.object,
    /** Optional default title for the chart if not specified in options.plugins.title.text */
    title: PropTypes.string,
    /** Optional CSS class name for the container div */
    className: PropTypes.string,
    /** Height of the chart container (CSS value) */
    height: PropTypes.string,
    /** Width of the chart container (CSS value) */
    width: PropTypes.string,
};

// Example Usage (assuming you have data in the correct format):
/*
const MyComponent = () => {
  const barData = {
    labels: ['January', 'February', 'March', 'April', 'May', 'June'],
    datasets: [
      {
        label: 'Dataset 1',
        data: [65, 59, 80, 81, 56, 55],
        // backgroundColor: 'rgba(255, 99, 132, 0.5)', // Optional: Provide colors
      },
       {
        label: 'Dataset 2',
        data: [35, 49, 60, 71, 46, 35],
        // backgroundColor: 'rgba(54, 162, 235, 0.5)', // Optional
      },
    ],
  };

  const pieData = {
     labels: ['Red', 'Blue', 'Yellow'],
     datasets: [{
         label: 'My First Dataset',
         data: [300, 50, 100],
         // backgroundColor: ['rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 205, 86)'], // Optional
         hoverOffset: 4
     }]
  };

  const lineOptions = {
      plugins: {
          title: { text: 'Monthly Sales Trend' },
          legend: { display: true }
      },
      scales: {
          y: { title: { display: true, text: 'Sales ($)' } }
      }
  }

  return (
    <div>
      <h2>Bar Chart Example</h2>
      <DataChart type="bar" data={barData} title="Monthly Revenue" height="400px" />

      <h2>Pie Chart Example</h2>
      <DataChart type="pie" data={pieData} title="Color Distribution" width="50%" height="350px" />

       <h2>Line Chart Example with Custom Options</h2>
      <DataChart type="line" data={barData} options={lineOptions} height="350px" />
    </div>
  );
}

options: {
 scales: {
  xAxes: [{
   type: 'time',
  }]
},
*/