package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

type presetPhase struct {
	Kind    string  `json:"kind"`
	Seconds float64 `json:"seconds"`
}

type preset struct {
	name        string
	description string
	cycles      int
	phases      []presetPhase
}

var presets = []preset{
	{
		name:        "Box Breathing",
		description: "Equal four-count breathing used by Navy SEALs to stay calm and focused. Inhale, hold, exhale, hold — each for 4 seconds.",
		cycles:      10,
		phases: []presetPhase{
			{"inhale", 4}, {"hold", 4}, {"exhale", 4}, {"hold", 4},
		},
	},
	{
		name:        "4-7-8 Relaxing Breath",
		description: "Dr. Andrew Weil's tranquilizing breath. Great before sleep: inhale 4, hold 7, exhale slowly for 8.",
		cycles:      6,
		phases: []presetPhase{
			{"inhale", 4}, {"hold", 7}, {"exhale", 8},
		},
	},
	{
		name:        "Coherent Breathing",
		description: "Slow, even breathing at ~5.5 breaths per minute to balance the nervous system and improve HRV.",
		cycles:      15,
		phases: []presetPhase{
			{"inhale", 5.5}, {"exhale", 5.5},
		},
	},
	{
		name:        "Triangle Breathing",
		description: "A gentler cousin of box breathing: inhale, hold, exhale — three sides, four counts each.",
		cycles:      10,
		phases: []presetPhase{
			{"inhale", 4}, {"hold", 4}, {"exhale", 4},
		},
	},
	{
		name:        "Extended Exhale",
		description: "Exhaling longer than you inhale activates the parasympathetic system. Simple and effective stress relief.",
		cycles:      12,
		phases: []presetPhase{
			{"inhale", 4}, {"exhale", 6},
		},
	},
	{
		name:        "Calm Down (Physiological Sigh Pace)",
		description: "A slow paced pattern inspired by the physiological sigh: deep inhale, short top-up hold, long releasing exhale.",
		cycles:      8,
		phases: []presetPhase{
			{"inhale", 5}, {"hold", 1.5}, {"exhale", 8},
		},
	},
	{
		name:        "Energize",
		description: "Faster rhythmic breathing to wake up body and mind. Stop if you feel light-headed.",
		cycles:      20,
		phases: []presetPhase{
			{"inhale", 2}, {"exhale", 2},
		},
	},
	{
		name:        "Ujjayi Pace",
		description: "Slow oceanic yoga breathing: long steady inhales and exhales through the nose with a soft throat constriction.",
		cycles:      12,
		phases: []presetPhase{
			{"inhale", 6}, {"exhale", 6},
		},
	},
}

func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("sequences")
		if err != nil {
			return err
		}
		for _, p := range presets {
			rec := core.NewRecord(col)
			rec.Set("name", p.name)
			rec.Set("description", p.description)
			rec.Set("cycles", p.cycles)
			rec.Set("phases", p.phases)
			rec.Set("is_preset", true)
			if err := app.Save(rec); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		recs, err := app.FindRecordsByFilter("sequences", "is_preset = true", "", 0, 0)
		if err != nil {
			return nil
		}
		for _, r := range recs {
			if err := app.Delete(r); err != nil {
				return err
			}
		}
		return nil
	})
}
