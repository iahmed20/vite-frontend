import { useState, useEffect } from 'react';
import './App.css'
import { ResponsiveContainer, CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts';
import axios from 'axios'

const SYMBOLS = ["MEOW", "NEKO", "PAWS", "TUNA", "YARN"];

function App() {
  const [selectedSymbol, setSelectedSymbol] = useState("MEOW");
  const [data, setData] = useState([]);

  useEffect(() => {
    const fetchPrices = () => {
      axios.get(`http://localhost:5078/api/Securities/${selectedSymbol}/prices`)
        .then((response) => {
          setData(response.data);
        })
        .catch((error) => console.error("Data fetching error:", error));
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);
    return () => clearInterval(interval);
  }, [selectedSymbol]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', margin: '16px' }}>
        {SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            onClick={() => setSelectedSymbol(symbol)}
            style={{
              fontWeight: symbol === selectedSymbol ? 'bold' : 'normal',
              backgroundColor: symbol === selectedSymbol ? '#f0528e' : '#c64384',
            }}
          >
            {symbol}
          </button>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 800, backgroundColor: '#000000', margin: 'auto' }}>
        <h3>{selectedSymbol} Price</h3>
        <ResponsiveContainer width="100%" aspect={1.618}>
          <LineChart data={data}>
            <CartesianGrid stroke="#9ca1ff" strokeDasharray="5 5" />
            <XAxis
              dataKey="timestamp"
              stroke="#333"
              tickFormatter={(utcTime) => {
                const date = new Date(utcTime + "Z");
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              }}
            />
            <YAxis dataKey="price" domain={['auto', 'auto']} stroke="#333" />
            <Line
              isAnimationActive={false}
              type="linear"
              dataKey="price"
              stroke="#0be400"
              dot={{ fill: '#000000' }}
              activeDot={{ stroke: '#fff' }}
              strokeWidth={3}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default App