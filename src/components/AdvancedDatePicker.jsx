import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';

const AdvancedDatePicker = ({ value, onChange, placeholder = "Selecione..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const [viewMode, setViewMode] = useState('days'); // 'days', 'months', 'years'
    const [selectionStart, setSelectionStart] = useState(null);
    const containerRef = useRef(null);

    // Parse value: can be "YYYY-MM-DD" or "YYYY-MM-DD:YYYY-MM-DD"
    const parsedRange = useMemo(() => {
        if (!value) return { start: null, end: null };
        const parts = value.split(':');
        return {
            start: parts[0] ? new Date(parts[0] + 'T00:00:00') : null,
            end: parts[1] ? new Date(parts[1] + 'T00:00:00') : null
        };
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const handlePrev = (e) => {
        e.stopPropagation();
        if (viewMode === 'days') {
            setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
        } else if (viewMode === 'months') {
            setViewDate(new Date(viewDate.getFullYear() - 1, viewDate.getMonth(), 1));
        } else if (viewMode === 'years') {
            setViewDate(new Date(viewDate.getFullYear() - 12, viewDate.getMonth(), 1));
        }
    };

    const handleNext = (e) => {
        e.stopPropagation();
        if (viewMode === 'days') {
            setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
        } else if (viewMode === 'months') {
            setViewDate(new Date(viewDate.getFullYear() + 1, viewDate.getMonth(), 1));
        } else if (viewMode === 'years') {
            setViewDate(new Date(viewDate.getFullYear() + 12, viewDate.getMonth(), 1));
        }
    };

    const handleDayClick = (day) => {
        const selectedDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        const dateStr = selectedDate.toISOString().split('T')[0];

        if (!selectionStart) {
            setSelectionStart(selectedDate);
            onChange(dateStr); // Single date selection first
        } else {
            // Range selection
            const start = selectionStart < selectedDate ? selectionStart : selectedDate;
            const end = selectionStart < selectedDate ? selectedDate : selectionStart;
            const rangeStr = `${start.toISOString().split('T')[0]}:${end.toISOString().split('T')[0]}`;
            onChange(rangeStr);
            setSelectionStart(null);
            setIsOpen(false);
        }
    };

    const handleMonthSelect = (e) => {
        e.stopPropagation();
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const first = new Date(year, month, 1).toISOString().split('T')[0];
        const last = new Date(year, month, daysInMonth(year, month)).toISOString().split('T')[0];
        onChange(`${first}:${last}`);
        setIsOpen(false);
    };

    const formatDateDisplay = () => {
        if (!value) return "";
        if (!value.includes(':')) {
            const date = new Date(value + 'T00:00:00');
            return date.toLocaleDateString('pt-BR');
        }
        const [startStr, endStr] = value.split(':');
        const start = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr + 'T00:00:00');

        // If it's a full month range, show month name
        if (start.getDate() === 1 && end.getDate() === daysInMonth(end.getFullYear(), end.getMonth())) {
            return start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        }

        return `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} - ${end.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    };

    const renderDays = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const numDays = daysInMonth(year, month);
        const offset = firstDayOfMonth(year, month);
        const days = [];

        // Header days
        ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(d => days.push(
            <div key={`h-${d}-${Math.random()}`} className="datepicker-day-header">{d}</div>
        ));

        // Empty offsets
        for (let i = 0; i < offset; i++) {
            days.push(<div key={`off-${i}`} className="datepicker-day empty"></div>);
        }

        // Real days
        for (let d = 1; d <= numDays; d++) {
            const date = new Date(year, month, d);
            const isToday = date.toDateString() === new Date().toDateString();

            let status = "";
            if (value) {
                if (!value.includes(':')) {
                    if (value === date.toISOString().split('T')[0]) status = "selected";
                } else {
                    const [s, e] = value.split(':');
                    const start = new Date(s + 'T00:00:00');
                    const end = new Date(e + 'T00:00:00');
                    if (date >= start && date <= end) status = "in-range";
                    if (date.getTime() === start.getTime()) status = "range-start";
                    if (date.getTime() === end.getTime()) status = "range-end";
                }
            }
            if (selectionStart && date.toDateString() === selectionStart.toDateString()) status = "selected";

            days.push(
                <div
                    key={`day-${d}`}
                    className={`datepicker-day ${status} ${isToday ? 'today' : ''}`}
                    onClick={() => handleDayClick(d)}
                >
                    {d}
                </div>
            );
        }

        return days;
    };

    const renderMonths = () => {
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        return months.map((m, i) => (
            <div
                key={m}
                className={`datepicker-selector-item ${viewDate.getMonth() === i ? 'current' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    setViewDate(new Date(viewDate.getFullYear(), i, 1));
                    setViewMode('days');
                }}
            >
                {m}
            </div>
        ));
    };

    const renderYears = () => {
        const startYear = viewDate.getFullYear() - (viewDate.getFullYear() % 12);
        const years = [];
        for (let i = 0; i < 12; i++) {
            const y = startYear + i;
            years.push(
                <div
                    key={y}
                    className={`datepicker-selector-item ${viewDate.getFullYear() === y ? 'current' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        setViewDate(new Date(y, viewDate.getMonth(), 1));
                        setViewMode('months');
                    }}
                >
                    {y}
                </div>
            );
        }
        return years;
    };

    const renderContent = () => {
        if (viewMode === 'days') {
            return (
                <>
                    <div className="datepicker-grid">
                        {renderDays()}
                    </div>
                </>
            );
        } else if (viewMode === 'months') {
            return <div className="datepicker-selector-grid months">{renderMonths()}</div>;
        } else if (viewMode === 'years') {
            return <div className="datepicker-selector-grid years">{renderYears()}</div>;
        }
    };
    return (
        <div className="advanced-datepicker-container" ref={containerRef}>
            <div className="datepicker-input-wrapper" onClick={() => {
                setIsOpen(!isOpen);
                setViewMode('days');
            }}>
                <input
                    type="text"
                    readOnly
                    placeholder={placeholder}
                    value={formatDateDisplay()}
                    className="column-filter-input"
                />
                <CalendarIcon size={14} className="datepicker-icon" />
                {value && (
                    <X
                        size={14}
                        className="datepicker-clear"
                        onClick={(e) => {
                            e.stopPropagation();
                            onChange('');
                            setSelectionStart(null);
                        }}
                    />
                )}
            </div>

            {isOpen && (
                <div className="datepicker-dropdown">
                    <div className="datepicker-header">
                        <button onClick={handlePrev}><ChevronLeft size={16} /></button>
                        <div className="datepicker-nav-controls">
                            <span onClick={(e) => { e.stopPropagation(); setViewMode('months'); }} className="nav-month">
                                {viewDate.toLocaleDateString('pt-BR', { month: 'long' })}
                            </span>
                            <span onClick={(e) => { e.stopPropagation(); setViewMode('years'); }} className="nav-year">
                                {viewDate.getFullYear()}
                            </span>
                            <button className="nav-select-all" onClick={handleMonthSelect} title="Selecionar mês inteiro">
                                <ChevronRight size={12} style={{ transform: 'rotate(90deg)' }} />
                            </button>
                        </div>
                        <button onClick={handleNext}><ChevronRight size={16} /></button>
                    </div>

                    {renderContent()}

                    <div className="datepicker-footer">
                        <div className="flex gap-2 w-full">
                            <button
                                className="btn-today flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 font-bold"
                                onClick={() => {
                                    const today = new Date();
                                    setViewDate(today);
                                    onChange(today.toISOString().split('T')[0]);
                                    setIsOpen(false);
                                    setSelectionStart(null);
                                    setViewMode('days');
                                }}
                            >
                                Hoje
                            </button>
                            {value && (
                                <button
                                    className="btn-clear-filter flex-1 bg-red-50 text-red-600 hover:bg-red-100 font-bold"
                                    onClick={() => {
                                        onChange('');
                                        setSelectionStart(null);
                                        setIsOpen(false);
                                    }}
                                >
                                    Limpar Filtro
                                </button>
                            )}
                            <button
                                className="btn-confirm flex-1 bg-green-50 text-green-700 hover:bg-green-100 font-bold"
                                onClick={() => setIsOpen(false)}
                            >
                                Aplicar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdvancedDatePicker;
