import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import type { CarInfo } from '../lib'
import { useI18n } from '../lib/i18n'
import { useSeoMetaSafe } from '../lib/seo'
import AccentButton from '../components/AccentButton'
import GlassCard from '../components/ui/GlassCard'
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut'

const SEGMENTS = [
  'B-Sedan', 'C-Sedan', 'D-Sedan', 'B-SUV', 'C-SUV', 'D-SUV',
  'MPV', 'Pickup', 'A-Hatch', 'B-Hatch', 'A-SUV', 'EV-Mini',
]

export default function Wizard() {
  const { t, locale } = useI18n()
  useSeoMetaSafe({ title: `ViDrive - ${t('nav.wizard')}`, description: t('page.wizardDescription'), noindex: true })
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState({
    brand: '',
    model: '',
    price: '',
    type: 'ICE',
    consumption: '6.0',
    annual_maintenance: '8000000',
    seats: '5',
    segment_type: 'C-Sedan',
    depreciation_rate: '',
  })
  const [showNotification, setShowNotification] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const updateField = (field: string, value: string) => {
    const newFormData = { ...formData, [field]: value }
    setFormData(newFormData)
    setFieldErrors(validateStep(newFormData))
  }

  const validateStep = (data: typeof formData = formData): Record<string, string> => {
    const errors: Record<string, string> = {}
    switch (step) {
      case 0:
        if (!data.brand.trim()) errors.brand = t('wizard.validation.required')
        if (!data.model.trim()) errors.model = t('wizard.validation.required')
        break
      case 1:
        if (!data.price || parseFloat(data.price) <= 0) errors.price = t('wizard.validation.priceRequired')
        break
      case 2:
        if (!data.consumption || parseFloat(data.consumption) <= 0) errors.consumption = t('wizard.validation.consumptionRequired')
        if (!data.annual_maintenance || parseFloat(data.annual_maintenance) < 0) errors.annual_maintenance = t('wizard.validation.maintenanceRequired')
        if (!data.seats || parseInt(data.seats) < 2) errors.seats = t('wizard.validation.satsRequired')
        break
      case 3:
        if (!data.segment_type || !SEGMENTS.includes(data.segment_type)) {
          errors.segment_type = t('wizard.validation.segmentRequired')
        }
        break
    }
    return errors
  }

  const canProceed = (): boolean => {
    return Object.keys(fieldErrors).length === 0
  }

  const nextStep = () => {
    const errors = validateStep()
    setFieldErrors(errors)
    if (Object.keys(errors).length === 0) setStep(step + 1)
  }
  const prevStep = () => setStep(step - 1)

  useEffect(() => {
    setFieldErrors(validateStep())
  }, [step, locale])

  const handleSave = () => {
    const errors = validateStep()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const customCar: CarInfo = {
      id: `custom-${Date.now()}`,
      brand: formData.brand,
      model: formData.model,
      price: parseFloat(formData.price) || 0,
      type: formData.type,
      seats: parseInt(formData.seats) || 5,
      consumption: parseFloat(formData.consumption) || 0,
      annual_maintenance: parseFloat(formData.annual_maintenance) || 0,
      segment: formData.segment_type,
      depreciation_rate: formData.depreciation_rate ? parseFloat(formData.depreciation_rate) / 100 : undefined,
    }

    try {
      sessionStorage.setItem('vidrive-custom-car', JSON.stringify(customCar))
    } catch {
      /* ignore */
    }

    setShowNotification(true)
    // Auto-dismiss notification then navigate back to car listing
    setTimeout(() => {
      setShowNotification(false)
      navigate('/car')
    }, 1200)
  }

  const steps = [
    { labelKey: 'wizard.brandModel' },
    { labelKey: 'wizard.priceType' },
    { labelKey: 'wizard.specs' },
    { labelKey: 'wizard.segment' },
  ]

  useKeyboardShortcut(
    (e) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA'
      if (isInput) return
      if (e.key === 'ArrowLeft' && step > 0) {
        e.preventDefault()
        prevStep()
      }
       if (e.key === 'ArrowRight' && step < steps.length - 1) {
         e.preventDefault()
         if (canProceed()) setStep(step + 1)
       }
    },
    [step],
  )


  const firstStepError = Object.values(fieldErrors)[0] || ''

  return (
    <div className="space-y-8">
      <h1 className="sr-only">{t('wizard.title')}</h1>
      {showNotification && (
        <motion.div
          className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-success/10 border border-success/30 text-success text-sm font-medium z-50"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {t('wizard.carAdded')}
        </motion.div>
      )}

      <>
        {/* Progress Bar */}
        <div className="flex gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`w-full h-2 rounded-full transition-all duration-500 ${
                  i <= step ? 'accent-gradient' : 'bg-[var(--bg-elevated)]'
                }`}
              />
              <span className={'text-xs font-medium ' + (i <= step ? 'text-accent' : 'text-[var(--text-secondary)]')}>
                {t(s.labelKey)}
              </span>
            </div>
          ))}
        </div>

        <GlassCard className="p-6">
          <motion.h2
            key={step}
            className="text-xl font-heading font-bold text-[var(--text-primary)] mb-6"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
          >
            {t(steps[step].labelKey)}
          </motion.h2>

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="wizard-brand">{t('wizard.brand')}</label>
                <input
                  id="wizard-brand"
                  type="text"
                  placeholder={t('wizard.brandPlaceholder')}
                  value={formData.brand}
                  onChange={(e) => updateField('brand', e.target.value)}
                    className={'w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50 transition-colors ' + (fieldErrors.brand ? 'border-danger' : 'border-[var(--border-default)]')}
                   aria-invalid={!!fieldErrors.brand}
                   aria-describedby={fieldErrors.brand ? 'error-brand' : undefined}
                 />
                {fieldErrors.brand && <p id="error-brand" className="text-danger text-xs mt-1">{fieldErrors.brand}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="wizard-model">{t('wizard.model')}</label>
                <input
                  id="wizard-model"
                  type="text"
                  placeholder={t('wizard.modelPlaceholder')}
                  value={formData.model}
                  onChange={(e) => updateField('model', e.target.value)}
                    className={'w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50 transition-colors ' + (fieldErrors.model ? 'border-danger' : 'border-[var(--border-default)]')}
                   aria-invalid={!!fieldErrors.model}
                   aria-describedby={fieldErrors.model ? 'error-model' : undefined}
                 />
                {fieldErrors.model && <p id="error-model" className="text-danger text-xs mt-1">{fieldErrors.model}</p>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="wizard-price">{t('wizard.price')}</label>
                <input
                  id="wizard-price"
                  type="number"
                  placeholder={t('wizard.pricePlaceholder')}
                  value={formData.price}
                  onChange={(e) => updateField('price', e.target.value)}
                    className={'w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-accent/50 transition-colors ' + (fieldErrors.price ? 'border-danger' : 'border-[var(--border-default)]')}
                   aria-invalid={!!fieldErrors.price}
                   aria-describedby={fieldErrors.price ? 'error-price' : undefined}
                 />
                {fieldErrors.price && <p id="error-price" className="text-danger text-xs mt-1">{fieldErrors.price}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('wizard.type')}</label>
                <select
                  value={formData.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  className="w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors"
                >
                  <option value="ICE">{t('wizard.typeICE')}</option>
                  <option value="ICE-D">{t('wizard.typeICED')}</option>
                  <option value="HEV">{t('wizard.typeHEV')}</option>
                  <option value="EV">{t('wizard.typeEV')}</option>
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="wizard-consumption">{t('wizard.consumption')}</label>
                <input
                  id="wizard-consumption"
                  type="number"
                  step="0.1"
                  value={formData.consumption}
                  onChange={(e) => updateField('consumption', e.target.value)}
                    className={'w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors ' + (fieldErrors.consumption ? 'border-danger' : 'border-[var(--border-default)]')}
                   aria-invalid={!!fieldErrors.consumption}
                   aria-describedby={fieldErrors.consumption ? 'error-consumption' : undefined}
                 />
                {fieldErrors.consumption && <p id="error-consumption" className="text-danger text-xs mt-1">{fieldErrors.consumption}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="wizard-annual-maint">{t('wizard.annualMaint')}</label>
                <input
                  id="wizard-annual-maint"
                  type="number"
                  value={formData.annual_maintenance}
                  onChange={(e) => updateField('annual_maintenance', e.target.value)}
                    className={'w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors ' + (fieldErrors.annual_maintenance ? 'border-danger' : 'border-[var(--border-default)]')}
                   aria-invalid={!!fieldErrors.annual_maintenance}
                   aria-describedby={fieldErrors.annual_maintenance ? 'error-annual-maint' : undefined}
                 />
                {fieldErrors.annual_maintenance && <p id="error-annual-maint" className="text-danger text-xs mt-1">{fieldErrors.annual_maintenance}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-2" htmlFor="wizard-seats">{t('wizard.seats')}</label>
                <input
                  id="wizard-seats"
                  type="number"
                  min="2"
                  max="9"
                  value={formData.seats}
                  onChange={(e) => updateField('seats', e.target.value)}
                    className={'w-full px-4 py-3 bg-[rgba(var(--bg-base-rgb),0.5)] border rounded-xl text-[var(--text-primary)] focus:outline-none focus:border-accent/50 transition-colors ' + (fieldErrors.seats ? 'border-danger' : 'border-[var(--border-default)]')}
                   aria-invalid={!!fieldErrors.seats}
                   aria-describedby={fieldErrors.seats ? 'error-seats' : undefined}
                 />
                {fieldErrors.seats && <p id="error-seats" className="text-danger text-xs mt-1">{fieldErrors.seats}</p>}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">{t('wizard.vehicleSegment')}</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3" role="radiogroup" aria-invalid={!!fieldErrors.segment_type} aria-describedby={fieldErrors.segment_type ? 'error-segment' : undefined}>
                {SEGMENTS.map((seg) => (
                  <button
                    key={seg}
                    type="button"
                    role="radio"
                    aria-checked={formData.segment_type === seg}
                    onClick={() => updateField('segment_type', seg)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                      formData.segment_type === seg
                        ? 'accent-gradient text-[var(--bg-base)] shadow-lg shadow-accent/20'
                        : 'bg-[rgba(var(--bg-base-rgb),0.5)] border border-[var(--border-default)] text-[var(--text-primary)]/70 hover:border-accent/30 hover:text-accent'
                    }`}
                  >
                    {seg}
                  </button>
                ))}
              </div>
              {fieldErrors.segment_type && (
                <p id="error-segment" className="text-danger text-xs mt-2" role="alert">
                  {fieldErrors.segment_type}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between mt-6">
            <AccentButton variant="outline" onClick={prevStep} disabled={step === 0}>
              {t('wizard.back')}
            </AccentButton>
            {step < steps.length - 1 ? (
              <AccentButton onClick={nextStep} disabled={!canProceed()} title={!canProceed() ? firstStepError : undefined}>
              {t('wizard.next')}
              </AccentButton>
            ) : (
              <AccentButton onClick={handleSave} disabled={!canProceed()}>
                {t('wizard.saveCar')}
              </AccentButton>
            )}
          </div>
        </GlassCard>
      </>
    </div>
  )
}
